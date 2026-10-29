// The service worker pre-caches paid-module ciphertext from a hard-coded
// list (it can't list a directory). Fail if that list and the files on
// disk ever drift apart, which would silently break offline unlocking.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { readModuleCiphertexts, MODULES_DIR } = require('../lib/module-ciphertext');

const WWW = path.join(__dirname, '..', '..', 'www');

test('sw.js MODULE_FILES matches www/assets/modules/', () => {
  const sw = fs.readFileSync(path.join(WWW, 'sw.js'), 'utf8');
  const m = /const MODULE_FILES = \[([\d,\s]+)\]/.exec(sw);
  assert.ok(m, 'MODULE_FILES list not found in sw.js');
  const listed = m[1].split(',').map((n) => 'sec-' + n.trim() + '.json').sort();
  const onDisk = fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(listed, onDisk);
});

test('every locked-gate in index.html has a ciphertext file with both payloads', () => {
  const all = readModuleCiphertexts();
  assert.ok(Object.keys(all).length > 0);
  for (const [idx, enc] of Object.entries(all)) {
    for (const kind of ['individual', 'bundle']) {
      assert.ok(enc[kind] && enc[kind].salt && enc[kind].iv && enc[kind].ct, 'sec-' + idx + ' missing ' + kind);
    }
  }
});

test('index.html no longer carries inline module ciphertext', () => {
  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /data-individual=|data-bundle=/);
  assert.ok(html.length < 500000, 'index.html is ' + html.length + ' bytes');
});
