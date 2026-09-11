#!/usr/bin/env node
// ══════════════════════════════════════════
// check-translation-sync.js — CI gate. Fails the build if any shipped
// translation's recorded content-hash no longer matches the CURRENT
// English text for that block — i.e. someone edited a module's English
// content in index.html without regenerating its translations, so a
// user picking that language would now silently get that block back in
// English (translate.js's own hash check correctly refuses to serve a
// stale translation — this just surfaces that as a build-time failure
// instead of a runtime surprise nobody notices until a user reports it).
//
// Uses jsdom to split each module's decrypted English content into
// top-level blocks and hash them exactly the way the app itself does
// (hashBlockElement in translate.js) — real DOM textContent semantics,
// not a hand-rolled regex approximation. Validated directly against two
// modules' already-shipped, browser-verified hashes before this script
// was trusted with a nonzero exit code, including the one case (a
// literal "pH < 5.5" inside an ASCII diagram) that broke an earlier
// regex-based hasher this project used.
//
// Needs the BUNDLE key to decrypt each module's English content (every
// locked module's .locked-gate carries a bundle-encrypted variant
// alongside its individual-key one). Reads it from:
//   1. MES_BUNDLE_KEY env var (set this as a GitHub Actions secret to
//      turn this check on in CI — see apk-releases/README.md), or
//   2. LICENSE-KEYS-SECRET.md in the repo root (local dev runs).
// If neither is available, this prints a warning and exits 0 (skip)
// rather than failing a build that simply hasn't been wired up yet.
//
//   node scripts/check-translation-sync.js
// ══════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const LANGS = ['fr', 'de', 'zh', 'ja', 'ko', 'it'];

function getBundleKey() {
  if (process.env.MES_BUNDLE_KEY) return process.env.MES_BUNDLE_KEY;
  const secretsPath = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');
  if (fs.existsSync(secretsPath)) {
    const text = fs.readFileSync(secretsPath, 'utf8');
    const m = /## Bundle key[^\n]*\n\n`([^`]+)`/.exec(text);
    if (m) return m[1];
  }
  return null;
}

function deriveAesKey(passphrase, saltB64) {
  return crypto.pbkdf2Sync(passphrase, Buffer.from(saltB64, 'base64'), 100000, 32, 'sha256');
}
function tryDecrypt(encObj, passphrase) {
  try {
    const key = deriveAesKey(passphrase, encObj.salt);
    const iv = Buffer.from(encObj.iv, 'base64');
    const raw = Buffer.from(encObj.ct, 'base64');
    const tag = raw.subarray(raw.length - 16);
    const ct = raw.subarray(0, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}
function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('base64').slice(0, 16);
}

// Mirrors translate.js's hashBlockElement() exactly, using jsdom for real
// DOM textContent semantics instead of approximating them with regex.
const sharedDom = new JSDOM('');
function hashBlocksOf(plaintextHtml) {
  const container = sharedDom.window.document.createElement('div');
  container.innerHTML = plaintextHtml;
  return Array.from(container.children).map((el) => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.star-btn').forEach((b) => b.remove());
    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    return contentHash(text);
  });
}

function main() {
  const bundleKey = getBundleKey();
  if (!bundleKey) {
    console.log('⚠️  check-translation-sync: no bundle key available (MES_BUNDLE_KEY env var ' +
      'or LICENSE-KEYS-SECRET.md) — skipping. See apk-releases/README.md to enable this check in CI.');
    process.exit(0);
  }

  const indexHtml = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');
  const gateRe = /<div class="locked-gate" data-module="(\d+)" data-individual='[^']*' data-bundle='([^']*)'>/g;
  const englishHashesByModule = {};
  let gm;
  while ((gm = gateRe.exec(indexHtml))) {
    const idx = gm[1];
    const bundleEnc = JSON.parse(gm[2]);
    const plaintext = tryDecrypt(bundleEnc, bundleKey + '::sec-' + idx);
    if (!plaintext) {
      console.error('❌ Could not decrypt sec-' + idx + ' with the bundle key — wrong key, or the ' +
        'encryption format changed. Aborting (treating as a failure, not a skip).');
      process.exit(1);
    }
    englishHashesByModule[idx] = hashBlocksOf(plaintext);
  }
  const moduleCount = Object.keys(englishHashesByModule).length;
  console.log('Decrypted and hashed ' + moduleCount + ' modules’ current English content.');

  const problems = [];
  let langsChecked = 0;
  for (const lang of LANGS) {
    const file = path.join(ROOT, 'www', 'assets', 'translations', lang + '.js');
    if (!fs.existsSync(file)) continue;
    langsChecked++;
    const src = fs.readFileSync(file, 'utf8');
    const m = /window\.PRETRANSLATED_\w+\s*=\s*(\{[\s\S]*\});?\s*$/.exec(src);
    if (!m) { problems.push({ lang, idx: '*', issue: 'unrecognized file format' }); continue; }
    const table = JSON.parse(m[1]);
    for (const idx of Object.keys(table)) {
      const currentHashes = englishHashesByModule[idx];
      if (!currentHashes) {
        problems.push({ lang, idx, issue: 'translation exists for a module with no matching locked-gate in index.html' });
        continue;
      }
      const stored = table[idx];
      if (stored.length !== currentHashes.length) {
        problems.push({ lang, idx, issue: 'block count changed: English has ' + currentHashes.length + ', translation has ' + stored.length });
        continue;
      }
      for (let i = 0; i < stored.length; i++) {
        if (stored[i].hash !== currentHashes[i]) {
          problems.push({ lang, idx, block: i, issue: 'English content changed since this block was translated (hash mismatch)' });
        }
      }
    }
  }

  console.log('Checked ' + langsChecked + ' language file(s) against current English content.');
  if (problems.length) {
    console.error('\n❌ ' + problems.length + ' translation(s) are out of sync with the current English content:\n');
    for (const p of problems) {
      console.error('  [' + p.lang + '] module ' + p.idx + (p.block !== undefined ? ', block ' + p.block : '') + ': ' + p.issue);
    }
    console.error('\nUsers picking these languages will see these blocks fall back to English ' +
      '(translate.js’s own hash check refuses to serve a stale translation). Re-run the ' +
      'translation pipeline for the affected module(s)/language(s) before shipping this content change.');
    process.exit(1);
  }
  console.log('✅ Every shipped translation matches the current English content.');
}

main();
