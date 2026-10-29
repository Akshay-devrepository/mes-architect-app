#!/usr/bin/env node
// ══════════════════════════════════════════
// generate-translations.js — fills in missing or stale pre-translations.
//
// For every requested language × paid module it decrypts the English
// content, splits it into the same top-level blocks the app translates
// (getTranslatableBlocks in translate.js), and hashes each one exactly like
// the app does (lib/block-hash.js). Blocks whose hash already has a
// translation in www/assets/translations/<lang>.js are kept as they are;
// only new or changed blocks are sent to Groq. A module is written only
// once ALL its blocks are translated — the app offers a language for a
// module only at full coverage, so a half-done module would be dead
// weight. Other modules and languages in the file are never touched.
//
// Resumable: finished chunks go to .translation-checkpoint.enc, encrypted
// with a key derived from the bundle key (it holds paid content in the
// clear otherwise, and CI caches it). Re-run until it reports complete.
//
// Environment:
//   GROQ_API_KEY        required
//   LICENSE_KEYS_MD     contents of LICENSE-KEYS-SECRET.md (else that file is read)
//   TRANSLATE_LANGS     comma list, default fr,de,zh,ja,ko,it
//   TRANSLATE_MODULES   comma list of 0-based module indexes, default all paid
//   TRANSLATE_MODEL     Groq model id, default openai/gpt-oss-20b
//   TIME_BUDGET_MIN     stop cleanly after this many minutes (0 = no limit)
//
//   node scripts/generate-translations.js
// ══════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { encrypt, tryDecrypt } = require('./lib/crypto-utils');
const { hashElement } = require('./lib/block-hash');
const { readModuleCiphertexts } = require('./lib/module-ciphertext');
const { parseExistingKeys, collectLeafChunks, translateHtml } = require('./lib/html-translate');

const ROOT = path.join(__dirname, '..');
const LANGUAGE_NAMES = {
  fr: 'French', de: 'German', zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean', it: 'Italian'
};
const MAX_CHUNK_CHARS = 3200; // ~800 tokens of HTML — under Groq's free-tier per-minute token cap
const CHECKPOINT_SAVE_EVERY = 10;

function readTable(file) {
  if (!fs.existsSync(file)) return {};
  const m = /window\.PRETRANSLATED_\w+\s*=\s*(\{[\s\S]*\});?\s*$/.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error('unrecognized format in ' + file);
  return JSON.parse(m[1]);
}
function writeTable(file, lang, table) {
  fs.writeFileSync(file, 'window.PRETRANSLATED_' + lang.toUpperCase() + ' = ' + JSON.stringify(table) + ';\n', 'utf8');
}

// The module's top-level blocks: what translate.js swaps one innerHTML at
// a time, with the same hash the app and check-translation-sync compute.
function blocksOf(plaintext) {
  const doc = new JSDOM('').window.document;
  const container = doc.createElement('div');
  container.innerHTML = plaintext;
  return Array.from(container.children).map((el) => ({ hash: hashElement(el), outerHTML: el.outerHTML }));
}

// Translate one block. Chunked on the OUTER element (so oversized blocks can
// be split along their children), then the wrapper is stripped: the app
// assigns the result to the existing block's innerHTML.
async function translateBlock(block, lang, ctx) {
  const html = block.outerHTML;
  const chunks = [];
  collectLeafChunks(html, 0, html.length, MAX_CHUNK_CHARS, chunks);
  let rebuilt = html;
  for (let ci = chunks.length - 1; ci >= 0; ci--) { // back to front keeps earlier offsets valid
    const { start, end } = chunks[ci];
    const key = lang + ':' + block.hash + ':' + start + '-' + end;
    let out = ctx.checkpoint[key];
    if (out === undefined) {
      if (ctx.outOfTime()) throw new Error('time-budget');
      out = await ctx.translate(html.slice(start, end), LANGUAGE_NAMES[lang]);
      ctx.checkpoint[key] = out;
      ctx.stats.translatedChunks++;
      if (ctx.stats.translatedChunks % CHECKPOINT_SAVE_EVERY === 0) ctx.saveCheckpoint();
    } else {
      ctx.stats.cachedChunks++;
    }
    rebuilt = rebuilt.slice(0, start) + out + rebuilt.slice(end);
  }
  const inner = /^\s*<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>([\s\S]*)<\/[a-zA-Z][a-zA-Z0-9-]*>\s*$/.exec(rebuilt);
  return inner ? inner[1] : rebuilt;
}

async function run(opts) {
  const {
    rootDir = ROOT, langs, modules, keysMd, translate,
    timeBudgetMs = 0, log = console.log, now = Date.now
  } = opts;
  const started = now();
  const keys = parseExistingKeys(keysMd);
  if (!keys.bundleKey) throw new Error('No bundle key in the license-keys file');

  const wwwDir = path.join(rootDir, 'www');
  const outDir = path.join(wwwDir, 'assets', 'translations');
  fs.mkdirSync(outDir, { recursive: true });
  const checkpointFile = path.join(rootDir, '.translation-checkpoint.enc');
  const checkpointPass = keys.bundleKey + '::translation-checkpoint';
  const ciphertexts = readModuleCiphertexts({
    indexPath: path.join(wwwDir, 'index.html'),
    modulesDir: path.join(wwwDir, 'assets', 'modules')
  });

  let checkpoint = {};
  if (fs.existsSync(checkpointFile)) {
    const plain = tryDecrypt(JSON.parse(fs.readFileSync(checkpointFile, 'utf8')), checkpointPass);
    if (plain) checkpoint = JSON.parse(plain);
    else log('⚠️  checkpoint does not decrypt with this bundle key — starting fresh');
  }
  const ctx = {
    checkpoint, translate,
    stats: { translatedChunks: 0, cachedChunks: 0 },
    outOfTime: () => timeBudgetMs > 0 && now() - started > timeBudgetMs,
    saveCheckpoint: () => fs.writeFileSync(checkpointFile, JSON.stringify(encrypt(JSON.stringify(ctx.checkpoint), checkpointPass)))
  };

  const targetModules = (modules && modules.length ? modules : Object.keys(ciphertexts).map(Number)).map(String);
  const report = [];
  let stoppedEarly = false;

  // Decrypt and split each module once, shared by every language.
  const english = {};
  for (const idx of targetModules) {
    if (!ciphertexts[idx]) throw new Error('sec-' + idx + ' is not a locked module');
    if (!keys.moduleKeys[idx]) throw new Error('No individual key for module index ' + idx + ' in the license-keys file');
    const plain = tryDecrypt(ciphertexts[idx].bundle, keys.bundleKey + '::sec-' + idx);
    if (!plain) throw new Error('Bundle key does not decrypt sec-' + idx);
    english[idx] = blocksOf(plain);
  }

  outer:
  for (const lang of langs) {
    if (!LANGUAGE_NAMES[lang]) throw new Error('Unsupported language ' + lang + ' (app supports ' + Object.keys(LANGUAGE_NAMES).join(',') + ')');
    const file = path.join(outDir, lang + '.js');
    const table = readTable(file);
    for (const idx of targetModules) {
      const blocks = english[idx];
      const existing = table[idx] || [];
      if (existing.length === blocks.length && existing.every((e, i) => e.hash === blocks[i].hash)) {
        report.push({ lang, idx, status: 'up-to-date', blocks: blocks.length });
        continue;
      }
      const reusable = new Map(existing.map((e) => [e.hash, e]));
      const entries = [];
      let reused = 0;
      try {
        for (const block of blocks) {
          const keep = reusable.get(block.hash);
          if (keep) { entries.push(keep); reused++; continue; }
          const translated = await translateBlock(block, lang, ctx);
          entries.push({
            hash: block.hash,
            individual: encrypt(translated, keys.moduleKeys[idx]),
            bundle: encrypt(translated, keys.bundleKey + '::sec-' + idx)
          });
        }
      } catch (e) {
        ctx.saveCheckpoint();
        if (e.message === 'time-budget') {
          report.push({ lang, idx, status: 'incomplete (time budget)', blocks: blocks.length });
          stoppedEarly = true;
          break outer;
        }
        // One stubborn chunk shouldn't sink the run: leave this module for
        // the next run (its finished chunks are checkpointed) and move on.
        report.push({ lang, idx, status: 'incomplete (' + e.message + ')', blocks: blocks.length });
        continue;
      }
      table[idx] = entries;
      writeTable(file, lang, table);
      ctx.saveCheckpoint();
      report.push({ lang, idx, status: 'written', blocks: blocks.length, reused });
      log(lang + ' sec-' + idx + ': written (' + blocks.length + ' blocks, ' + reused + ' reused)');
    }
  }
  ctx.saveCheckpoint();
  const complete = !stoppedEarly && report.every((r) => r.status === 'up-to-date' || r.status === 'written');
  return { report, complete, stats: ctx.stats };
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.startsWith('gsk_')) {
    console.error('Set GROQ_API_KEY (a real key starting with gsk_).');
    process.exit(1);
  }
  const keysFile = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');
  const keysMd = process.env.LICENSE_KEYS_MD || (fs.existsSync(keysFile) ? fs.readFileSync(keysFile, 'utf8') : '');
  if (!keysMd) {
    console.error('Provide the license keys: LICENSE_KEYS_MD env var or LICENSE-KEYS-SECRET.md.');
    process.exit(1);
  }
  const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const model = process.env.TRANSLATE_MODEL || 'openai/gpt-oss-20b';
  const { report, complete, stats } = await run({
    langs: list(process.env.TRANSLATE_LANGS || Object.keys(LANGUAGE_NAMES).join(',')),
    modules: list(process.env.TRANSLATE_MODULES).map(Number),
    keysMd,
    translate: (html, language) => translateHtml(html, language, { apiKey, model }),
    timeBudgetMs: (parseFloat(process.env.TIME_BUDGET_MIN) || 0) * 60000
  });

  const lines = ['| Language | Module | Status | Blocks |', '|---|---|---|---|']
    .concat(report.map((r) => '| ' + r.lang + ' | ' + (Number(r.idx) + 1) + ' | ' + r.status + ' | ' + r.blocks + ' |'));
  const summary = '### Translation run\n\n' + (complete ? '✅ Everything requested is translated.' :
    '⏳ Not finished — run the workflow again; it resumes where this one stopped.') +
    '\n\nChunks translated this run: ' + stats.translatedChunks + ' (reused from checkpoint: ' + stats.cachedChunks + ')\n\n' +
    lines.join('\n') + '\n';
  console.log('\n' + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (require.main === module) main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });

module.exports = { run, blocksOf, LANGUAGE_NAMES };
