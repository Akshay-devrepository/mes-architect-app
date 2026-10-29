#!/usr/bin/env node
// One-time (idempotent) migration: moves each locked module's inline
// ciphertext out of www/index.html into www/assets/modules/sec-<idx>.json,
// leaving an attribute-free .locked-gate behind. license.js fetches a
// module's file only when someone tries a key on it, so the ~4.4 MB of
// ciphertext no longer has to be downloaded and parsed on every cold start.
// Ciphertext is copied byte-for-byte — no key is needed and every existing
// license key keeps working.
//
//   node scripts/split-module-ciphertext.js
const fs = require('fs');
const path = require('path');
const { moduleFile, MODULES_DIR, LEGACY_GATE_RE } = require('./lib/module-ciphertext');

const INDEX_PATH = path.join(__dirname, '..', 'www', 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');
fs.mkdirSync(MODULES_DIR, { recursive: true });

let moved = 0;
const out = html.replace(LEGACY_GATE_RE, (_, idx, individual, bundle) => {
  const payload = { individual: JSON.parse(individual), bundle: JSON.parse(bundle) };
  fs.writeFileSync(moduleFile(idx), JSON.stringify(payload) + '\n', 'utf8');
  moved++;
  return '<div class="locked-gate" data-module="' + idx + '">';
});

if (!moved) {
  console.log('Nothing to do — index.html has no inline module ciphertext.');
} else {
  fs.writeFileSync(INDEX_PATH, out, 'utf8');
  console.log('Moved ' + moved + ' modules to ' + path.relative(process.cwd(), MODULES_DIR) +
    '/ — index.html ' + (html.length / 1e6).toFixed(2) + ' MB → ' + (out.length / 1e6).toFixed(2) + ' MB');
}
