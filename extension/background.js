/**
 * SafeSurf - Background Service Worker (Manifest V3)
 * 
 * Intercepts adult and restricted web destinations in real-time using:
 * 1. An in-memory Set loaded from extension/data/domains.json (988k+ domains)
 * 2. chrome.webNavigation.onBeforeNavigate top-frame interceptor
 * 3. User-defined custom whitelist & blacklist stored in chrome.storage.sync
 * 4. Automatic stats telemetry and badge management
 */

// Default configuration settings
const DEFAULT_SETTINGS = {
  enabled: true,
  customWhitelist: [],
  customBlacklist: [],
  stats: {
    blockedSites: 0,
    maskedWords: 0,
    blurredImages: 0
  },
  lastUpdated: Date.now()
};

// In-memory runtime state
let isProtectionEnabled = true;
let customWhitelistSet = new Set();
let customBlacklistSet = new Set();
let blockedDomainsSet = null;
let domainLoadPromise = null;
let settingsReadyPromise = null;
let settingsRevision = 0;

/**
 * Ensures settings have been synced from storage at least once.
 * Critical for MV3 cold starts: the service worker may be woken by a
 * navigation event before any storage.onChanged event, in which case
 * the in-memory enabled flag would still be the default (true).
 * @returns {Promise<void>}
 */
function ensureSettingsSynced() {
  if (!settingsReadyPromise) {
    settingsReadyPromise = syncSettingsFromStorage();
  }
  return settingsReadyPromise;
}

// ============================================================================
// DeclarativeNetRequest Dynamic Rules (Phase 5 SafeSearch Enforcer)
// ============================================================================
const SAFESEARCH_RULE_IDS = [1001, 1002, 1003, 1004, 1005, 1006, 1007];

const SAFESEARCH_RULES = [
  // 1. Google SafeSearch Enforcement (safe=active)
  {
    id: 1001,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'safe', value: 'active' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||google.com/search?',
      resourceTypes: ['main_frame']
    }
  },
  // 2. Bing SafeSearch Enforcement (adlt=strict)
  {
    id: 1002,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'adlt', value: 'strict' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||bing.com/search?',
      resourceTypes: ['main_frame']
    }
  },
  // 3. DuckDuckGo SafeSearch Enforcement (kp=1)
  {
    id: 1003,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'kp', value: '1' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||duckduckgo.com/?',
      resourceTypes: ['main_frame']
    }
  },
  // 4. YouTube Restricted Mode Header Injection (YouTube-Restrict: Strict)
  {
    id: 1004,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'YouTube-Restrict', operation: 'set', value: 'Strict' }
      ]
    },
    condition: {
      urlFilter: '||youtube.com',
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
    }
  },
  // 5. Brave Search SafeSearch Enforcement (safesearch=strict)
  {
    id: 1005,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'safesearch', value: 'strict' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||search.brave.com/search',
      resourceTypes: ['main_frame']
    }
  },
  // 6. Yahoo SafeSearch Enforcement (vm=r)
  {
    id: 1006,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'vm', value: 'r' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||search.yahoo.com/search',
      resourceTypes: ['main_frame']
    }
  },
  // 7. Yandex Family Filter (family=1)
  {
    id: 1007,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            addOrReplaceParams: [{ key: 'family', value: '1' }]
          }
        }
      }
    },
    condition: {
      urlFilter: '||yandex.com/search',
      resourceTypes: ['main_frame']
    }
  }
];

/**
 * Updates dynamic network rules for SafeSearch engines
 * @param {boolean} enabled 
 */
async function updateSafeSearchRules(enabled) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: SAFESEARCH_RULE_IDS,
        addRules: SAFESEARCH_RULES
      });
      console.log('[SafeSurf SW] Active SafeSearch rules applied (Google, Bing, DDG, YouTube)');
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: SAFESEARCH_RULE_IDS
      });
      console.log('[SafeSurf SW] SafeSearch rules removed (Protection Paused)');
    }
  } catch (err) {
    console.error('[SafeSurf SW] Error updating declarative SafeSearch rules:', err);
  }
}

/**
 * Normalizes domain string (removes protocol, port, trailing slashes, spaces)
 * @param {string} input 
 * @returns {string}
 */
function normalizeDomain(input) {
  if (!input) return '';
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//i, '');
  d = d.split('/')[0].split(':')[0];
  if (d.startsWith('www.')) d = d.substring(4);
  return d;
}

/**
 * Loads the consolidated blocked domains database into an in-memory Set
 * Handles cold service worker wakeups transparently
 * @returns {Promise<Set<string>>}
 */
async function ensureDomainSetLoaded() {
  if (blockedDomainsSet) return blockedDomainsSet;
  if (domainLoadPromise) return domainLoadPromise;

  domainLoadPromise = (async () => {
    const startTime = performance.now();
    try {
      const dataUrl = chrome.runtime.getURL('data/domains.json');
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading domains.json`);
      }
      const domainsList = await response.json();
      blockedDomainsSet = new Set(domainsList);
      const elapsed = (performance.now() - startTime).toFixed(1);
      console.log(`[SafeSurf SW] Loaded ${blockedDomainsSet.size.toLocaleString()} threat domains into memory in ${elapsed}ms`);
    } catch (err) {
      console.error('[SafeSurf SW] Failed to load domains.json:', err);
      blockedDomainsSet = new Set();
    }
    return blockedDomainsSet;
  })();

  return domainLoadPromise;
}

// ============================================================================
// Profanity Engine - Search Query Interception
// ============================================================================

// Seed dictionary (mirrors content.js) for instant availability before JSON loads
const SEED_PROFANITY = [
  'fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'asshole',
  'dick', 'cock', 'pussy', 'cunt', 'bastard', 'slut', 'whore', 'porn',
  'nigger', 'nigga', 'faggot', 'chutiya', 'madarchod', 'bhenchod',
  'bhosdike', 'gandu', 'harami', 'kameena', 'thevidiya', 'punda',
  'oombu', 'sunni', 'mayiru', 'lavde', 'lund', 'randi', 'gaand'
];

// Hosts whose search queries are inspected for profanity
const SEARCH_ENGINE_REGEX = /^(?:google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.brave\.com|brave\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z]+|ecosia\.org|startpage\.com|qwant\.com|mojeek\.com|baidu\.com|search\.naver\.com)$/i;
const SEARCH_QUERY_PARAMS = ['q', 'p', 'query', 'text', 'search_query', 'wd'];

let profanityRegex = null;
let profanityLoadPromise = null;

/**
 * Compiles a word-boundary profanity matcher
 * @param {string[]} words 
 * @returns {RegExp|null}
 */
function compileProfanityRegex(words) {
  const unique = Array.from(new Set((words || []).map((w) => String(w).trim().toLowerCase()))).filter(Boolean);
  if (unique.length === 0) return null;
  unique.sort((a, b) => b.length - a.length);
  const escaped = unique.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

/**
 * Loads the profanity dictionaries into a cached matcher
 * @returns {Promise<RegExp|null>}
 */
async function ensureProfanityLoaded() {
  if (profanityRegex) return profanityRegex;
  if (profanityLoadPromise) return profanityLoadPromise;

  profanityLoadPromise = (async () => {
    try {
      const [enRes, indicRes] = await Promise.allSettled([
        fetch(chrome.runtime.getURL('data/profanity/en.json')).then((r) => r.json()),
        fetch(chrome.runtime.getURL('data/profanity/indic.json')).then((r) => r.json())
      ]);

      const words = [...SEED_PROFANITY];
      if (enRes.status === 'fulfilled') words.push(...enRes.value);
      if (indicRes.status === 'fulfilled') words.push(...indicRes.value);

      profanityRegex = compileProfanityRegex(words);
      console.log(`[SafeSurf SW] Profanity engine ready (${words.length} terms)`);
    } catch (err) {
      console.error('[SafeSurf SW] Profanity dictionary load failed, using seed list:', err);
      profanityRegex = compileProfanityRegex(SEED_PROFANITY);
    }
    return profanityRegex;
  })();

  return profanityLoadPromise;
}

/**
 * Extracts the search query from a known search-engine URL
 * @param {string} urlString 
 * @returns {string|null} query text, or null if not a search navigation
 */
function extractSearchQuery(urlString) {
  try {
    const u = new URL(urlString);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.substring(4);
    if (!SEARCH_ENGINE_REGEX.test(host)) return null;

    for (const key of SEARCH_QUERY_PARAMS) {
      const val = u.searchParams.get(key);
      if (val && val.trim()) return val;
    }
    return '';
  } catch (err) {
    return null;
  }
}

/**
 * Updates extension action badge based on current protection state
 * @param {boolean} isEnabled 
 */
async function updateBadge(isEnabled) {
  try {
    if (isEnabled) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Vibrant emerald
      await chrome.action.setTitle({ title: 'SafeSurf: Protection Active' });
    } else {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b' }); // Slate gray
      await chrome.action.setTitle({ title: 'SafeSurf: Protection Paused' });
    }
  } catch (err) {
    console.error('[SafeSurf SW] Error updating badge:', err);
  }
}

/**
 * Checks if a hostname or any of its parent domain suffixes is in a given Set
 * e.g., for "sub.video.badsite.com", checks:
 * 1. "sub.video.badsite.com"
 * 2. "video.badsite.com"
 * 3. "badsite.com"
 * @param {string} hostname 
 * @param {Set<string>} domainSet 
 * @returns {boolean}
 */
function matchesDomainOrSuffix(hostname, domainSet) {
  if (!hostname || !domainSet || domainSet.size === 0) return false;
  
  // Exact match
  if (domainSet.has(hostname)) return true;

  // Suffix inspection
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (domainSet.has(parent)) return true;
  }

  return false;
}

/**
 * Migrates legacy stats from chrome.storage.sync to chrome.storage.local.
 * Older builds stored counters in sync, whose ~120 writes/min quota broke
 * the master toggle. One-time best-effort migration; failures are ignored.
 */
async function migrateStatsToLocal() {
  try {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get('stats'),
      chrome.storage.local.get('stats')
    ]);

    if (syncData.stats && !localData.stats) {
      await chrome.storage.local.set({ stats: syncData.stats });
    }
    if (syncData.stats) {
      await chrome.storage.sync.remove('stats');
    }
  } catch (err) {
    // Non-fatal: stats simply start from zero
  }
}

/**
 * Synchronizes in-memory settings with chrome.storage.sync
 * Guarded by settingsRevision so a slow cold-start read cannot clobber
 * a newer toggle that already arrived via storage.onChanged.
 */
async function syncSettingsFromStorage() {
  const revisionAtStart = settingsRevision;
  try {
    const data = await chrome.storage.sync.get(['enabled', 'customWhitelist', 'customBlacklist']);

    const updates = {};
    if (typeof data.enabled === 'undefined') updates.enabled = DEFAULT_SETTINGS.enabled;
    if (!data.customWhitelist) updates.customWhitelist = DEFAULT_SETTINGS.customWhitelist;
    if (!data.customBlacklist) updates.customBlacklist = DEFAULT_SETTINGS.customBlacklist;

    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
    }

    // A storage change landed while we were reading — it is newer, keep it.
    if (settingsRevision !== revisionAtStart) {
      await updateBadge(isProtectionEnabled);
      await updateSafeSearchRules(isProtectionEnabled);
      return;
    }

    isProtectionEnabled = typeof data.enabled !== 'undefined' ? data.enabled : DEFAULT_SETTINGS.enabled;
    customWhitelistSet = new Set((data.customWhitelist || []).map(normalizeDomain));
    customBlacklistSet = new Set((data.customBlacklist || []).map(normalizeDomain));

    await updateBadge(isProtectionEnabled);
    await updateSafeSearchRules(isProtectionEnabled);
  } catch (err) {
    console.error('[SafeSurf SW] Error syncing settings from storage:', err);
  }
}

/**
 * Determines whether a target URL is blocked
 * Evaluation priority:
 * 1. Whitelist (always allows)
 * 2. Custom Blacklist (always blocks)
 * 3. Built-in Adult Domain Database (blocks if matched)
 * @param {string} urlString 
 * @returns {Promise<{ isBlocked: boolean, reason: string|null, domain: string }>}
 */
async function evaluateUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith('www.')) hostname = hostname.substring(4);

    // 1. Check custom whitelist
    if (matchesDomainOrSuffix(hostname, customWhitelistSet)) {
      return { isBlocked: false, reason: 'whitelisted', domain: hostname };
    }

    // 2. Check custom blacklist
    if (matchesDomainOrSuffix(hostname, customBlacklistSet)) {
      return { isBlocked: true, reason: 'Custom User Blacklist', domain: hostname };
    }

    // 3. Check threat database
    const domainSet = await ensureDomainSetLoaded();
    if (matchesDomainOrSuffix(hostname, domainSet)) {
      return { isBlocked: true, reason: 'Adult / Explicit Content', domain: hostname };
    }

    // 4. Block search queries containing profanity (e.g. searching cuss words)
    const searchQuery = extractSearchQuery(urlString);
    if (searchQuery) {
      const regex = await ensureProfanityLoaded();
      if (regex && regex.test(searchQuery)) {
        return { isBlocked: true, reason: 'Profanity in search query', domain: hostname };
      }
    }

    return { isBlocked: false, reason: null, domain: hostname };
  } catch (err) {
    return { isBlocked: false, reason: null, domain: '' };
  }
}

/**
 * Increments a named counter in persistent stats storage.
 * Stats live in chrome.storage.local on purpose: storage.sync enforces a
 * hard ~120 writes/minute quota, and per-word stat writes would exhaust it,
 * breaking the master toggle's sync writes. local has no write-rate quota.
 * @param {'blockedSites'|'maskedWords'|'blurredImages'} key
 * @param {number} amount
 */
async function incrementStat(key, amount = 1) {
  try {
    const data = await chrome.storage.local.get('stats');
    const stats = data.stats || { blockedSites: 0, maskedWords: 0, blurredImages: 0 };
    stats[key] = (stats[key] || 0) + amount;
    await chrome.storage.local.set({ stats });
  } catch (err) {
    console.error(`[SafeSurf SW] Failed to record ${key} stat:`, err);
  }
}

/**
 * Increments blocked site count in persistent storage
 */
async function recordBlockedSite() {
  return incrementStat('blockedSites', 1);
}

// ============================================================================
// Navigation Interceptor (Phase 2 Core Engine)
// ============================================================================
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only intercept main frame top-level navigations
  if (details.frameId !== 0) return;

  const url = details.url;
  // Ignore non-web schemes and internal extension pages
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  // MV3 cold-start guard: the worker may be woken by this very event,
  // so make sure the enabled flag is loaded before trusting it.
  await ensureSettingsSynced();

  // If protection is toggled off, allow immediately
  if (!isProtectionEnabled) return;

  // Evaluate target destination
  const evaluation = await evaluateUrl(url);

  if (evaluation.isBlocked) {
    console.warn(`[SafeSurf Interceptor] Blocked destination: ${url} (${evaluation.reason})`);

    // Redirect tab immediately to blocked.html interstitial
    const blockedPageUrl = chrome.runtime.getURL(
      `blocked.html?url=${encodeURIComponent(url)}&category=${encodeURIComponent(evaluation.reason)}`
    );

    try {
      await chrome.tabs.update(details.tabId, { url: blockedPageUrl });
      await recordBlockedSite();
    } catch (tabErr) {
      console.warn('[SafeSurf Interceptor] Tab update redirect note:', tabErr.message);
    }
  }
});

// ============================================================================
// Extension Lifecycle Listeners
// ============================================================================
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[SafeSurf SW] onInstalled:', details.reason);
  settingsReadyPromise = null;
  await ensureSettingsSynced();
  ensureDomainSetLoaded(); // Pre-warm database
  ensureProfanityLoaded(); // Pre-warm profanity matcher
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[SafeSurf SW] onStartup');
  settingsReadyPromise = null;
  await ensureSettingsSynced();
  ensureDomainSetLoaded(); // Pre-warm database
  ensureProfanityLoaded(); // Pre-warm profanity matcher
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync') {
    // Invalidate any in-flight cold-start sync when rule state changes,
    // so a slow storage read cannot clobber a newer toggle/list edit.
    if (changes.enabled || changes.customWhitelist || changes.customBlacklist) {
      settingsRevision++;
      settingsReadyPromise = Promise.resolve();
    }

    if (changes.enabled) {
      isProtectionEnabled = changes.enabled.newValue;
      await updateBadge(isProtectionEnabled);
      await updateSafeSearchRules(isProtectionEnabled);
    }
    if (changes.customWhitelist) {
      customWhitelistSet = new Set((changes.customWhitelist.newValue || []).map(normalizeDomain));
    }
    if (changes.customBlacklist) {
      customBlacklistSet = new Set((changes.customBlacklist.newValue || []).map(normalizeDomain));
    }
  }
});

// ============================================================================
// Message Handling for Popup & Content Scripts
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PROTECTION_STATUS') {
    ensureSettingsSynced().then(async () => {
      const [syncData, localData] = await Promise.all([
        chrome.storage.sync.get(['enabled', 'customWhitelist', 'customBlacklist']),
        chrome.storage.local.get('stats')
      ]);
      sendResponse({
        enabled: syncData.enabled ?? true,
        stats: localData.stats ?? DEFAULT_SETTINGS.stats,
        customWhitelist: syncData.customWhitelist ?? [],
        customBlacklist: syncData.customBlacklist ?? [],
        totalBlockedDomains: blockedDomainsSet ? blockedDomainsSet.size : 988911
      });
    });
    return true;
  }

  if (message.type === 'INCREMENT_STAT') {
    const { key, amount = 1 } = message.payload || {};
    if (key === 'blockedSites' || key === 'maskedWords' || key === 'blurredImages') {
      incrementStat(key, amount);
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'CHECK_URL') {
    ensureSettingsSynced().then(() => evaluateUrl(message.url)).then(sendResponse);
    return true;
  }

  if (message.type === 'ADD_RULE') {
    const { listType, domain } = message.payload || {};
    const key = listType === 'whitelist' ? 'customWhitelist' : 'customBlacklist';
    const clean = normalizeDomain(domain);

    if (!clean) {
      sendResponse({ success: false, error: 'Invalid domain' });
      return true;
    }

    chrome.storage.sync.get(key, (data) => {
      const list = data[key] || [];
      if (!list.includes(clean)) {
        list.push(clean);
        chrome.storage.sync.set({ [key]: list }, () => {
          sendResponse({ success: true, list });
        });
      } else {
        sendResponse({ success: true, list });
      }
    });
    return true;
  }

  if (message.type === 'REMOVE_RULE') {
    const { listType, domain } = message.payload || {};
    const key = listType === 'whitelist' ? 'customWhitelist' : 'customBlacklist';
    const clean = normalizeDomain(domain);

    chrome.storage.sync.get(key, (data) => {
      let list = data[key] || [];
      list = list.filter((d) => d !== clean);
      chrome.storage.sync.set({ [key]: list }, () => {
        sendResponse({ success: true, list });
      });
    });
    return true;
  }
});

// Initialize on background worker boot
migrateStatsToLocal();
ensureSettingsSynced();
ensureDomainSetLoaded();
ensureProfanityLoaded();
