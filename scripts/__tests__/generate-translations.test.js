// generate-translations.js against a throwaway fixture: one locked module
// encrypted with test keys, a fake translator, and a pre-existing language
// file holding another module that must survive untouched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encrypt, tryDecrypt } = require('../lib/crypto-utils');
const { hashBlocksOf } = require('../lib/block-hash');
const { run } = require('../generate-translations');

const BUNDLE = 'TEST-BUNDLE';
const KEYS_MD = '## Bundle key (unlocks all)\n\n`' + BUNDLE + '`\n\n## Individual module keys\n\n' +
  '**Module 2 — MES Industry Overview**  \n`MES-M02-test`\n\n**Module 3 — ISA-95 Deep Dive**  \n`MES-M03-test`\n';
const ENGLISH = '<div class="dd-wrap"><div class="dd-title">Overall Equipment Effectiveness</div><p>Availability times performance.</p></div>\n' +
  '<div class="q-box"><div class="q-text">What is MES?</div></div>\n' +
  '<table><tr><td>pH &lt; 5.5</td></tr></table>';

// Marks text nodes so a "translation" is recognisable and tag structure is untouched.
const fakeTranslate = async (html, language) => html.replace(/>([^<]+)</g, (m, t) => '>' + (t.trim() ? '[' + language + '] ' + t : t) + '<');

function fixture(existing = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-tr-'));
  fs.mkdirSync(path.join(root, 'www', 'assets', 'modules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'www', 'assets', 'translations'), { recursive: true });
  fs.writeFileSync(path.join(root, 'www', 'index.html'), '<div class="locked-gate" data-module="1"></div>');
  fs.writeFileSync(path.join(root, 'www', 'assets', 'modules', 'sec-1.json'), JSON.stringify({
    individual: encrypt(ENGLISH, 'MES-M02-test'), bundle: encrypt(ENGLISH, BUNDLE + '::sec-1')
  }));
  if (Object.keys(existing).length) {
    fs.writeFileSync(path.join(root, 'www', 'assets', 'translations', 'fr.js'), 'window.PRETRANSLATED_FR = ' + JSON.stringify(existing) + ';\n');
  }
  return root;
}
const readFr = (root) => JSON.parse(/=\s*(\{[\s\S]*\});\s*$/.exec(fs.readFileSync(path.join(root, 'www', 'assets', 'translations', 'fr.js'), 'utf8'))[1]);

test('translates every block, with hashes the app and CI guard will accept', async () => {
  const root = fixture();
  const { complete } = await run({ rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: fakeTranslate, log: () => {} });
  assert.ok(complete);
  const entries = readFr(root)['1'];
  assert.deepEqual(entries.map((e) => e.hash), hashBlocksOf(ENGLISH));
  const first = tryDecrypt(entries[0].bundle, BUNDLE + '::sec-1');
  assert.match(first, /\[French\] Overall Equipment Effectiveness/);
  assert.doesNotMatch(first, /^<div class="dd-wrap">/, 'stored as inner HTML, wrapper stripped');
  assert.equal(tryDecrypt(entries[0].individual, 'MES-M02-test'), first, 'individual-key variant matches');
});

test('keeps other modules and still-valid blocks byte-for-byte, retranslates only changed ones', async () => {
  const hashes = hashBlocksOf(ENGLISH);
  const keepBlock = { hash: hashes[1], individual: { salt: 'a', iv: 'b', ct: 'kept' }, bundle: { salt: 'a', iv: 'b', ct: 'kept' } };
  const otherModule = [{ hash: 'zzz', individual: { salt: 'x', iv: 'y', ct: 'other' }, bundle: { salt: 'x', iv: 'y', ct: 'other' } }];
  const root = fixture({ 1: [{ hash: 'stale', individual: {}, bundle: {} }, keepBlock], 2: otherModule });
  let calls = 0;
  const counting = async (h, l) => { calls++; return fakeTranslate(h, l); };
  await run({ rootDir: root, langs: ['fr'], modules: [1], keysMd: KEYS_MD, translate: counting, log: () => {} });
  const table = readFr(root);
  assert.deepEqual(table['2'], otherModule, 'untouched module preserved');
  assert.deepEqual(table['1'][1], keepBlock, 'matching block reused, not retranslated');
  assert.equal(calls, 2, 'only the two blocks without a valid translation were sent');
});

test('up-to-date modules are skipped without any API calls', async () => {
  const root = fixture();
  await run({ rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: fakeTranslate, log: () => {} });
  let calls = 0;
  const { report } = await run({ rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: async () => { calls++; return ''; }, log: () => {} });
  assert.equal(calls, 0);
  assert.equal(report[0].status, 'up-to-date');
});

test('a failing chunk leaves the module unwritten, and the run resumes from the encrypted checkpoint', async () => {
  const root = fixture();
  let n = 0;
  const flaky = async (h, l) => { if (++n === 2) throw new Error('rate-limited'); return fakeTranslate(h, l); };
  const first = await run({ rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: flaky, log: () => {} });
  assert.equal(first.complete, false);
  assert.ok(!fs.existsSync(path.join(root, 'www', 'assets', 'translations', 'fr.js')), 'no half-translated module written');

  const raw = fs.readFileSync(path.join(root, '.translation-checkpoint.enc'), 'utf8');
  assert.doesNotMatch(raw, /Overall Equipment|French/, 'checkpoint holds no plaintext');

  let calls = 0;
  const second = await run({ rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: async (h, l) => { calls++; return fakeTranslate(h, l); }, log: () => {} });
  assert.ok(second.complete);
  assert.equal(calls, 2, 'the chunk done before the failure came from the checkpoint');
});

test('stops cleanly at the time budget and reports it', async () => {
  const root = fixture();
  let t = 0;
  const { complete, report } = await run({
    rootDir: root, langs: ['fr'], modules: [], keysMd: KEYS_MD, translate: fakeTranslate, log: () => {},
    timeBudgetMs: 1, now: () => (t += 5)
  });
  assert.equal(complete, false);
  assert.match(report[0].status, /time budget/);
});

test('refuses an unsupported language instead of writing a file the app ignores', async () => {
  const root = fixture();
  await assert.rejects(run({ rootDir: root, langs: ['es'], modules: [], keysMd: KEYS_MD, translate: fakeTranslate, log: () => {} }), /Unsupported language es/);
});
