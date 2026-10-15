/**
 * SafeSurf - Popup Script
 * 
 * Manages UI interactions, syncs master protection state via chrome.storage.sync,
 * detects incognito permission status with chrome.extension.isAllowedIncognitoAccess(),
 * and manages custom Whitelist/Blacklist rules + Domain Verification tool.
 */

// Tabs & Navigation
const tabMainBtn = document.getElementById('tabMainBtn');
const tabRulesBtn = document.getElementById('tabRulesBtn');
const viewMain = document.getElementById('viewMain');
const viewRules = document.getElementById('viewRules');

// DOM Elements - Main View
const toggle = document.getElementById('protectionToggle');
const heroCard = document.getElementById('heroCard');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const heroSubtext = document.getElementById('heroSubtext');
const dbCountDisplay = document.getElementById('dbCountDisplay');

const incognitoBadge = document.getElementById('incognitoBadge');
const incognitoWarningText = document.getElementById('incognitoWarningText');
const btnConfigureIncognito = document.getElementById('btnConfigureIncognito');
const btnIncognitoLabel = document.getElementById('btnIncognitoLabel');
const setupGuide = document.getElementById('setupGuide');
const extensionUrlCode = document.getElementById('extensionUrlCode');
const btnCopyUrl = document.getElementById('btnCopyUrl');

const statSitesBlocked = document.getElementById('statSitesBlocked');
const statWordsMasked = document.getElementById('statWordsMasked');
const statImagesBlurred = document.getElementById('statImagesBlurred');

const btnPreviewBlock = document.getElementById('btnPreviewBlock');
const btnRefreshStatus = document.getElementById('btnRefreshStatus');
const toastMessage = document.getElementById('toastMessage');

// DOM Elements - Rules View
const checkDomainInput = document.getElementById('checkDomainInput');
const btnCheckDomain = document.getElementById('btnCheckDomain');
const checkDomainResult = document.getElementById('checkDomainResult');

const newRuleDomain = document.getElementById('newRuleDomain');
const newRuleType = document.getElementById('newRuleType');
const btnAddRule = document.getElementById('btnAddRule');

const whitelistCount = document.getElementById('whitelistCount');
const whitelistTags = document.getElementById('whitelistTags');
const blacklistCount = document.getElementById('blacklistCount');
const blacklistTags = document.getElementById('blacklistTags');

/**
 * Display a temporary feedback toast in the popup
 * @param {string} msg 
 */
function showToast(msg) {
  toastMessage.textContent = msg;
  toastMessage.classList.add('show');
  setTimeout(() => {
    toastMessage.classList.remove('show');
  }, 2200);
}

/**
 * Switch tabs between Shield and Rules
 * @param {'main'|'rules'} tabName 
 */
function switchTab(tabName) {
  if (tabName === 'main') {
    tabMainBtn.classList.add('active');
    tabRulesBtn.classList.remove('active');
    viewMain.classList.add('active');
    viewRules.classList.remove('active');
  } else {
    tabMainBtn.classList.remove('active');
    tabRulesBtn.classList.add('active');
    viewMain.classList.remove('active');
    viewRules.classList.add('active');
  }
}

tabMainBtn.addEventListener('click', () => switchTab('main'));
tabRulesBtn.addEventListener('click', () => switchTab('rules'));

/**
 * Update the visual state of the hero card and master toggle
 * @param {boolean} isEnabled 
 */
function updateProtectionUI(isEnabled) {
  toggle.checked = isEnabled;
  if (isEnabled) {
    heroCard.classList.remove('disabled');
    statusLabel.textContent = 'Protection Active';
    heroSubtext.textContent = 'Real-time filtering of 18+ domains, SafeSearch & profanity';
  } else {
    heroCard.classList.add('disabled');
    statusLabel.textContent = 'Protection Paused';
    heroSubtext.textContent = 'Filtering is temporarily disabled across all tabs';
  }
}

/**
 * Update the telemetry counters in the popup
 * @param {object} stats 
 */
function updateStatsUI(stats) {
  if (!stats) return;
  statSitesBlocked.textContent = (stats.blockedSites || 0).toLocaleString();
  statWordsMasked.textContent = (stats.maskedWords || 0).toLocaleString();
  statImagesBlurred.textContent = (stats.blurredImages || 0).toLocaleString();
}

/**
 * Render custom whitelist and blacklist tags
 * @param {string[]} whitelist 
 * @param {string[]} blacklist 
 */
function renderRuleTags(whitelist = [], blacklist = []) {
  whitelistCount.textContent = whitelist.length;
  blacklistCount.textContent = blacklist.length;

  // Render Whitelist
  if (whitelist.length === 0) {
    whitelistTags.innerHTML = '<span class="empty-hint">No custom whitelisted domains</span>';
  } else {
    whitelistTags.innerHTML = '';
    whitelist.forEach((domain) => {
      const tag = document.createElement('span');
      tag.className = 'domain-tag';
      tag.innerHTML = `<span>${domain}</span><button class="tag-remove" data-type="whitelist" data-domain="${domain}">&times;</button>`;
      whitelistTags.appendChild(tag);
    });
  }

  // Render Blacklist
  if (blacklist.length === 0) {
    blacklistTags.innerHTML = '<span class="empty-hint">No custom blacklisted domains</span>';
  } else {
    blacklistTags.innerHTML = '';
    blacklist.forEach((domain) => {
      const tag = document.createElement('span');
      tag.className = 'domain-tag';
      tag.innerHTML = `<span>${domain}</span><button class="tag-remove" data-type="blacklist" data-domain="${domain}">&times;</button>`;
      blacklistTags.appendChild(tag);
    });
  }

  // Attach delete handlers
  document.querySelectorAll('.tag-remove').forEach((btn) => {
    btn.onclick = async (e) => {
      const listType = e.target.dataset.type;
      const domain = e.target.dataset.domain;
      chrome.runtime.sendMessage({
        type: 'REMOVE_RULE',
        payload: { listType, domain }
      }, (res) => {
        if (res && res.success) {
          showToast(`Removed ${domain}`);
          refreshAllData();
        }
      });
    };
  });
}

/**
 * Check incognito access using chrome.extension.isAllowedIncognitoAccess()
 */
function checkIncognitoAccess() {
  const extensionId = chrome.runtime.id;
  const configUrl = `chrome://extensions/?id=${extensionId}`;
  extensionUrlCode.textContent = configUrl;

  chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
    if (chrome.runtime.lastError) {
      console.warn('[SafeSurf] Error checking incognito:', chrome.runtime.lastError);
      return;
    }

    if (isAllowed) {
      incognitoBadge.textContent = 'Protected';
      incognitoBadge.className = 'pill-badge active';
      incognitoWarningText.textContent = 'SafeSurf is active and protecting private/incognito browsing tabs.';
      incognitoWarningText.style.color = '#34d399';
      btnConfigureIncognito.style.display = 'none';
      setupGuide.classList.remove('visible');
    } else {
      incognitoBadge.textContent = 'Not Allowed';
      incognitoBadge.className = 'pill-badge warning';
      incognitoWarningText.textContent = 'Chrome requires manual authorization to protect incognito tabs.';
      incognitoWarningText.style.color = '#fbbf24';
      btnConfigureIncognito.style.display = 'inline-flex';
    }
  });
}

/**
 * Copies the chrome://extensions URL to the user's clipboard
 */
async function copyExtensionsUrl() {
  const extensionId = chrome.runtime.id;
  const configUrl = `chrome://extensions/?id=${extensionId}`;
  try {
    await navigator.clipboard.writeText(configUrl);
    btnCopyUrl.textContent = 'Copied!';
    setTimeout(() => { btnCopyUrl.textContent = 'Copy'; }, 2000);
    showToast('Copied settings link to clipboard!');
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
  }
}

/**
 * Guides user to chrome://extensions page to toggle incognito permission.
 */
async function handleConfigureIncognitoClick() {
  const extensionId = chrome.runtime.id;
  const configUrl = `chrome://extensions/?id=${extensionId}`;

  try {
    await chrome.tabs.create({ url: configUrl });
  } catch (err) {
    console.info('[SafeSurf] Direct chrome:// navigation restricted by Chrome policy. Showing guide.');
  }

  await copyExtensionsUrl();
  setupGuide.classList.add('visible');
  btnIncognitoLabel.textContent = 'Copied! Paste in Address Bar';
}

/**
 * Loads all state, rules, and telemetry
 */
function refreshAllData() {
  chrome.runtime.sendMessage({ type: 'GET_PROTECTION_STATUS' }, (res) => {
    if (res) {
      updateProtectionUI(res.enabled);
      updateStatsUI(res.stats);
      renderRuleTags(res.customWhitelist, res.customBlacklist);
      if (res.totalBlockedDomains) {
        dbCountDisplay.textContent = res.totalBlockedDomains.toLocaleString();
      }
    }
  });
  checkIncognitoAccess();
}

// Master Toggle Event
toggle.addEventListener('change', async (e) => {
  const isEnabled = e.target.checked;
  updateProtectionUI(isEnabled);

  try {
    await chrome.storage.sync.set({ enabled: isEnabled });
    showToast(isEnabled ? 'Protection Enabled' : 'Protection Paused');
  } catch (err) {
    console.error('[SafeSurf] Failed to save state:', err);
    toggle.checked = !isEnabled;
    updateProtectionUI(!isEnabled);
  }
});

// Configure Incognito button click
btnConfigureIncognito.addEventListener('click', handleConfigureIncognitoClick);
btnCopyUrl.addEventListener('click', copyExtensionsUrl);

// Test Block Page button click
btnPreviewBlock.addEventListener('click', () => {
  const testUrl = chrome.runtime.getURL('blocked.html?url=example-adult-domain.com&category=Adult+Content');
  chrome.tabs.create({ url: testUrl });
});

// Test Text Masking button click
const btnTestMasking = document.getElementById('btnTestMasking');
if (btnTestMasking) {
  btnTestMasking.addEventListener('click', () => {
    const testUrl = chrome.runtime.getURL('test-masking.html');
    chrome.tabs.create({ url: testUrl });
  });
}

// Refresh button
btnRefreshStatus.addEventListener('click', () => {
  refreshAllData();
  showToast('Refreshed');
});

// Domain Verification Tool (Phase 2)
btnCheckDomain.addEventListener('click', () => {
  let target = checkDomainInput.value.trim();
  if (!target) return;
  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target;
  }

  chrome.runtime.sendMessage({ type: 'CHECK_URL', url: target }, (res) => {
    checkDomainResult.className = 'check-result show';
    if (res && res.isBlocked) {
      checkDomainResult.className += ' blocked';
      checkDomainResult.textContent = `🛑 BLOCKED: ${res.domain} (${res.reason})`;
    } else {
      checkDomainResult.className += ' allowed';
      checkDomainResult.textContent = `✅ ALLOWED: Safe destination`;
    }
  });
});

// Add Custom Rule (Phase 2)
btnAddRule.addEventListener('click', () => {
  const domain = newRuleDomain.value.trim();
  const listType = newRuleType.value;

  if (!domain) {
    showToast('Enter a valid domain');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'ADD_RULE',
    payload: { listType, domain }
  }, (res) => {
    if (res && res.success) {
      newRuleDomain.value = '';
      showToast(`Added ${domain} to ${listType}`);
      refreshAllData();
    } else {
      showToast('Error adding rule');
    }
  });
});

// Sync changes across open popups or service worker updates
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync') {
    if (changes.enabled) {
      updateProtectionUI(changes.enabled.newValue);
    }
    if (changes.stats) {
      updateStatsUI(changes.stats.newValue);
    }
    if (changes.customWhitelist || changes.customBlacklist) {
      refreshAllData();
    }
  }
});

// Initialize on popup opening
document.addEventListener('DOMContentLoaded', () => {
  refreshAllData();
});
