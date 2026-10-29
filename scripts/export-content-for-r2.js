#!/usr/bin/env node
// One-time migration: decrypts every paid module (and its translations) out
// of the current app bundle into backend/.content-export/, laid out exactly
// as the Worker reads it from R2:
//   modules/<section>.html
//   translations/<lang>/<section>.json   -> [{ hash, html }, ...] per block
// The folder is gitignored plaintext — upload it (see backend/README.md),
// then delete it.
//
// Bundle key comes from MES_BUNDLE_KEY or the gitignored LICENSE-KEYS-SECRET.md.
//   node scripts/export-content-for-r2.js

const fs = require('fs');
const path = require('path');
const { tryDecrypt } = require('./lib/crypto-utils');
const { readModuleCiphertexts } = require('./lib/module-ciphertext');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backend', '.content-export');
const LANGS = ['zh', 'de', 'fr', 'ja', 'ko', 'it'];

function bundleKey() {
  if (process.env.MES_BUNDLE_KEY) return process.env.MES_BUNDLE_KEY;
  const file = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');
  const m = fs.existsSync(file) && /## Bundle key[^\n]*\n\n`([^`]+)`/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) { console.error('No bundle key (MES_BUNDLE_KEY or LICENSE-KEYS-SECRET.md).'); process.exit(1); }
  return m[1];
}

function write(rel, data) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

const key = bundleKey();
let modules = 0;
for (const [section, { bundle }] of Object.entries(readModuleCiphertexts())) {
  const plain = tryDecrypt(bundle, key + '::sec-' + section);
  if (!plain) { console.error('Could not decrypt sec-' + section + ' — wrong key?'); process.exit(1); }
  write('modules/' + section + '.html', plain);
  modules++;
}

let files = 0, blocks = 0;
for (const lang of LANGS) {
  const src = fs.readFileSync(path.join(ROOT, 'www', 'assets', 'translations', lang + '.js'), 'utf8');
  const table = JSON.parse(/=\s*(\{[\s\S]*\});?\s*$/.exec(src)[1]);
  for (const section of Object.keys(table)) {
    const out = table[section].map((entry) => {
      const plain = tryDecrypt(entry.bundle, key + '::sec-' + section);
      if (!plain) { console.error('Could not decrypt ' + lang + ' sec-' + section); process.exit(1); }
      blocks++;
      return { hash: entry.hash, html: plain };
    });
    write('translations/' + lang + '/' + section + '.json', JSON.stringify(out));
    files++;
  }
}

console.log('Exported ' + modules + ' modules and ' + files + ' translation files (' + blocks + ' blocks) to ' +
  path.relative(ROOT, OUT) + '/ — plaintext: upload to R2, then delete this folder.');
