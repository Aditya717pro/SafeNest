/**
 * SafeSurf - Asset Downloader for Local MV3 NSFW.js Engine
 * 
 * Downloads TensorFlow.js runtime, NSFW.js bundle, and MobileNetV2 model weights
 * to extension/libs/ and extension/models/ to comply with Manifest V3 CSP restrictions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_DIR = path.resolve(__dirname, '../extension');
const LIBS_DIR = path.join(EXTENSION_DIR, 'libs');
const MODEL_DIR = path.join(EXTENSION_DIR, 'models/mobilenet_v2');

const ASSETS = [
  {
    name: 'tf.min.js',
    url: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
    dest: path.join(LIBS_DIR, 'tf.min.js')
  },
  {
    name: 'nsfwjs.min.js',
    url: 'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js',
    dest: path.join(LIBS_DIR, 'nsfwjs.min.js')
  },
  {
    name: 'model.json',
    url: 'https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2/model.json',
    dest: path.join(MODEL_DIR, 'model.json')
  },
  {
    name: 'group1-shard1of1',
    url: 'https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2/group1-shard1of1',
    dest: path.join(MODEL_DIR, 'group1-shard1of1')
  }
];

async function downloadFile(url, dest) {
  console.log(`[Downloader] Fetching ${url}...`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
  console.log(`[Downloader] Saved: ${dest} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  console.log('='.repeat(65));
  console.log(' SafeSurf NSFW.js & TensorFlow.js Local Model Bundler');
  console.log('='.repeat(65));

  for (const asset of ASSETS) {
    await downloadFile(asset.url, asset.dest);
  }

  console.log('='.repeat(65));
  console.log(' [SUCCESS] All AI classification assets bundled locally for MV3!');
  console.log('='.repeat(65));
}

main().catch(err => {
  console.error('[Downloader] Error:', err);
  process.exit(1);
});
