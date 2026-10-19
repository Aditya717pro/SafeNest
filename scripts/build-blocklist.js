/**
 * SafeNest - Android blocklist packer
 *
 * Converts extension/data/domains.json (a plain JSON array of hostnames) into the
 * compact binary asset the Android app binary-searches at runtime.
 *
 * Binary layout (all integers little-endian):
 *
 *   "SNBL"          4 bytes   magic
 *   version         uint32    format version (currently 1)
 *   count           uint32    number of hostnames
 *   offsets         uint32[]  count + 1 entries; byte offset of each hostname
 *                             inside the names blob (last entry = blob length)
 *   names           bytes     hostnames, US-ASCII, concatenated, sorted ascending
 *
 * Sorted order is what makes the on-device binary search possible, and the flat
 * layout keeps resident memory to roughly 4 bytes of overhead per domain.
 *
 * Usage:
 *   node scripts/build-blocklist.js [--limit=N]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_FILE = path.resolve(__dirname, '../extension/data/domains.json');
const OUTPUT_FILE = path.resolve(
  __dirname,
  '../android/app/src/main/assets/blocklist.bin'
);

const MAGIC = Buffer.from('SNBL', 'ascii');
const FORMAT_VERSION = 1;

/**
 * @param {string} value
 * @returns {string|null} normalized hostname or null when it is not usable
 */
function normalize(value) {
  const domain = String(value).trim().toLowerCase().replace(/\.$/, '');
  if (!domain || domain.length > 253) return null;
  // ASCII hostnames only; the Android store decodes names as US-ASCII.
  if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(domain)) {
    return null;
  }
  return domain;
}

function parseArgs() {
  const options = { limit: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.split('=')[1], 10);
    }
  }
  return options;
}

function main() {
  const options = parseArgs();
  const startedAt = Date.now();

  if (!fs.existsSync(SOURCE_FILE)) {
    console.error(`[pack] Source list not found: ${SOURCE_FILE}`);
    console.error('[pack] Run "npm run clean-domains" first.');
    process.exit(1);
  }

  console.log(`[pack] Reading ${SOURCE_FILE}`);
  const raw = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('[pack] Expected a JSON array of hostnames.');
    process.exit(1);
  }

  const unique = new Set();
  for (const entry of raw) {
    const domain = normalize(entry);
    if (domain) unique.add(domain);
  }

  let domains = Array.from(unique).sort();
  if (options.limit && domains.length > options.limit) {
    domains = domains.slice(0, options.limit);
  }

  const encoded = domains.map((domain) => Buffer.from(domain, 'ascii'));
  const namesLength = encoded.reduce((total, buffer) => total + buffer.length, 0);

  const header = Buffer.alloc(12);
  MAGIC.copy(header, 0);
  header.writeUInt32LE(FORMAT_VERSION, 4);
  header.writeUInt32LE(domains.length, 8);

  const offsets = Buffer.alloc((domains.length + 1) * 4);
  let cursor = 0;
  for (let i = 0; i < domains.length; i += 1) {
    offsets.writeUInt32LE(cursor, i * 4);
    cursor += encoded[i].length;
  }
  offsets.writeUInt32LE(cursor, domains.length * 4);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, Buffer.concat([header, offsets, ...encoded], 12 + offsets.length + namesLength));

  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('[pack] Done');
  console.log(`[pack]   domains : ${domains.length.toLocaleString()}`);
  console.log(`[pack]   output  : ${OUTPUT_FILE}`);
  console.log(`[pack]   size    : ${sizeMB} MB`);
  console.log(`[pack]   elapsed : ${elapsed}s`);
}

try {
  main();
} catch (error) {
  console.error('[pack] Fatal error:', error);
  process.exit(1);
}
