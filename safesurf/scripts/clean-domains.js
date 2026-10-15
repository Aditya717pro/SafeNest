/**
 * SafeSurf - Domain Cleaner & Consolidator
 * 
 * Fetches threat-intelligence adult domain lists from StevenBlack and BlockListProject,
 * parses hosts format, normalizes domains, removes subdomains covered by parent domains,
 * and outputs an optimized JSON database to extension/data/domains.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target output path
const OUTPUT_FILE = path.resolve(__dirname, '../extension/data/domains.json');
const CACHE_DIR = path.resolve(__dirname, 'cache');

// Remote list sources
const SOURCES = [
  {
    name: 'StevenBlack Porn Hosts',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn/hosts',
    format: 'hosts' // lines: "0.0.0.0 domain.com"
  },
  {
    name: 'BlockListProject Porn List',
    url: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt',
    format: 'domains' // lines: "domain.com" or "#..."
  }
];

// Rich fallback seed list ensuring immediate offline functionality & instant tests
const SEED_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'youporn.com',
  'redtube.com', 'tube8.com', 'chaturbate.com', 'stripchat.com', 'livejasmin.com',
  'camsoda.com', 'bongacams.com', 'cam4.com', 'myfreecams.com', 'flirt4free.com',
  'brazzers.com', 'naughtyamerica.com', 'realitykings.com', 'bangbros.com',
  'adultfriendfinder.com', 'fetlife.com', 'beeg.com', 'spankbang.com',
  'eporner.com', 'hqporner.com', 'tnaflix.com', 'daftsex.com', 'pornone.com',
  'motherless.com', 'heavy-r.com', 'rule34.xxx', 'gelbooru.com', 'danbooru.donmai.us',
  'luscious.net', 'hentaihaven.xxx', 'hanime.tv', 'nhentai.net', 'hitomi.la',
  'multporn.net', 'fakku.net', 'tsumino.com', 'pururin.io', 'e-hentai.org',
  'exhentai.org', 'fapello.com', 'erome.com', 'thothub.to', 'coomer.party',
  'bunkr.is', 'cyberdrop.me', 'simpcity.su', 'onlyfans.com', 'fansly.com',
  'manyvids.com', 'clips4sale.com', 'modelhub.com', 'porntrex.com',
  'sunporno.com', 'gotporn.com', 'txxx.com', 'vjav.com', 'javlibrary.com',
  'javbus.com', 'javhd.com', 'dmm.co.jp', 'r18.com', 'caribbeancom.com',
  '1pondo.tv', 'heyzo.com', 'pacopacomama.com', 'avgle.com', 'missav.com',
  'jable.tv', 'supjav.com', 'netflav.com', '7mmtv.tv', 'fc2.com',
  'thumbzilla.com', 'pornmd.com', 'lubetube.com', 'fuq.com', 'nuvid.com',
  'slutload.com', 'pornerbros.com', 'empflix.com', 'extremetube.com',
  'spankwire.com', 'hardsextube.com', 'drfap.com', 'porndig.com', 'pornhat.com',
  'tubegalore.com', 'porngo.com', 'cliphunter.com', 'madthumbs.com',
  'xxxymovies.com', 'skeetchat.com', 'imlive.com', 'streamate.com', 'jasmin.com'
];

/**
 * Validates domain string syntax
 * @param {string} domain 
 * @returns {boolean}
 */
function isValidDomain(domain) {
  if (!domain || domain.length > 253) return false;
  // Exclude IP addresses, local hosts, internal networks
  if (/^(0\.0\.0\.0|127\.0\.0\.1|localhost|local|broadcasthost|ip6-)/i.test(domain)) return false;
  // Domain format: alphanumeric labels separated by dots, valid TLD
  return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

/**
 * Normalizes a domain string to clean lowercase
 * @param {string} raw 
 * @returns {string|null}
 */
function cleanDomain(raw) {
  let d = raw.trim().toLowerCase();
  // Strip comments
  if (d.startsWith('#') || d.startsWith('!')) return null;
  const commentIdx = d.indexOf('#');
  if (commentIdx !== -1) d = d.substring(0, commentIdx).trim();

  // Strip leading IP addresses (e.g. "0.0.0.0 domain.com")
  d = d.replace(/^(0\.0\.0\.0|127\.0\.0\.1)\s+/, '').trim();

  // Strip protocols or paths if present
  d = d.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];

  // Strip trailing dot
  if (d.endsWith('.')) d = d.slice(0, -1);

  return isValidDomain(d) ? d : null;
}

/**
 * Fetches content from a URL with timeout and fallback cache
 * @param {string} url 
 * @param {string} cacheName 
 * @returns {Promise<string|null>}
 */
async function fetchSource(url, cacheName) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, cacheName);

  console.log(`[Fetcher] Fetching remote list: ${url}...`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const text = await res.text();
      fs.writeFileSync(cachePath, text, 'utf8');
      console.log(`[Fetcher] Downloaded & cached ${cacheName} (${(text.length / 1024 / 1024).toFixed(2)} MB)`);
      return text;
    } else {
      console.warn(`[Fetcher] HTTP ${res.status} for ${url}`);
    }
  } catch (err) {
    console.warn(`[Fetcher] Failed to fetch remote list (${err.message})`);
  }

  // Fallback to cached file if present
  if (fs.existsSync(cachePath)) {
    console.log(`[Fetcher] Using cached file: ${cacheName}`);
    return fs.readFileSync(cachePath, 'utf8');
  }

  return null;
}

/**
 * Consolidates domains by removing subdomains when root domain is already present
 * e.g., if "badsite.com" exists, removes "cdn.badsite.com", "m.badsite.com"
 * @param {Set<string>} domainSet 
 * @returns {string[]}
 */
function consolidateSubdomains(domainSet) {
  const sorted = Array.from(domainSet).sort((a, b) => a.length - b.length);
  const rootSet = new Set();
  const result = [];

  for (const domain of sorted) {
    const parts = domain.split('.');
    let hasParent = false;

    // Check if any parent domain is already in rootSet
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (rootSet.has(parent)) {
        hasParent = true;
        break;
      }
    }

    if (!hasParent) {
      rootSet.add(domain);
      result.push(domain);
    }
  }

  return result;
}

/**
 * Parse CLI flags (e.g. --limit=50000, --quick, etc.)
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { limit: null, quick: false };
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--quick') {
      options.quick = true;
    }
  }
  return options;
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('='.repeat(65));
  console.log(' SafeSurf Threat Intelligence Domain Cleaner & Optimizer');
  if (options.limit) console.log(` [MODE] Limiting output to top ${options.limit.toLocaleString()} domains`);
  console.log('='.repeat(65));

  const allDomains = new Set();

  // 1. Add guaranteed seed domains
  for (const seed of SEED_DOMAINS) {
    const cleaned = cleanDomain(seed);
    if (cleaned) allDomains.add(cleaned);
  }
  console.log(`[Cleaner] Loaded ${allDomains.size} core seed domains`);

  // 2. Fetch and parse remote sources
  let totalRawLines = 0;

  for (let i = 0; i < SOURCES.length; i++) {
    const src = SOURCES[i];
    const cacheName = `source_${i}.txt`;
    const content = await fetchSource(src.url, cacheName);

    if (content) {
      const lines = content.split(/\r?\n/);
      totalRawLines += lines.length;
      let count = 0;

      for (const line of lines) {
        const dom = cleanDomain(line);
        if (dom) {
          allDomains.add(dom);
          count++;
          if (options.limit && allDomains.size >= options.limit * 1.2) {
            break; // Early exit if limited
          }
        }
      }
      console.log(`[Cleaner] Extracted ${count.toLocaleString()} valid domains from ${src.name}`);
    }
  }

  console.log(`[Cleaner] Total unique raw domains gathered: ${allDomains.size.toLocaleString()}`);

  // 3. Suffix / Subdomain Consolidation
  console.log('[Cleaner] Consolidating subdomains for optimal lookup performance...');
  let consolidated = consolidateSubdomains(allDomains);
  const reduction = allDomains.size - consolidated.length;
  console.log(`[Cleaner] Consolidated ${reduction.toLocaleString()} redundant subdomains!`);

  if (options.limit && consolidated.length > options.limit) {
    consolidated = consolidated.slice(0, options.limit);
    console.log(`[Cleaner] Trimmed to requested limit: ${consolidated.length.toLocaleString()}`);
  }

  console.log(`[Cleaner] Final optimized domain count: ${consolidated.length.toLocaleString()}`);

  // 4. Sort and write to JSON
  consolidated.sort();

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(consolidated), 'utf8');

  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('='.repeat(65));
  console.log(` [SUCCESS] Output generated at:`);
  console.log(`           ${OUTPUT_FILE}`);
  console.log(` [STATS]   Total domains: ${consolidated.length.toLocaleString()}`);
  console.log(`           File size:     ${sizeMB} MB (${stats.size.toLocaleString()} bytes)`);
  console.log(`           Elapsed time:  ${durationSec}s`);
  console.log('='.repeat(65));
}

main().catch((err) => {
  console.error('[Cleaner] Fatal error:', err);
  process.exit(1);
});
