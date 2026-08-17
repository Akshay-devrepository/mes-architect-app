#!/usr/bin/env node
// ══════════════════════════════════════════
// package-hand-translations.js — packages hand-authored translations into
// the encrypted www/assets/translations/<lang>.js files the app loads.
//
// Companion to scripts/generate-translations.js (the Groq-based batch
// translator): that script calls an AI API to produce the translated
// HTML; this one assumes the translated HTML already exists as plain
// files (e.g. translated directly by an LLM assistant in an editor,
// no API calls) and just does the mechanical part — hashing the English
// original and encrypting the translation with the same keys that
// already gate that module's English content (both individual-key and
// bundle-key variants), matching scripts/encrypt-modules.js's scheme.
//
// Expected input layout (see ENGLISH_DIR / TRANSLATED_DIR below):
//   <source>/english-source/sec-<idx>-card-<i>.html   — one file per card,
//     the FULL card element (e.g. starting with <div class="dd-wrap">),
//     extracted verbatim from the decrypted module content.
//   <source>/translated/<lang>/sec-<idx>-card-<i>.html — the same card
//     translated into <lang>, same FULL-element format (this script
//     strips the outer wrapper before storing — the runtime does
//     card.innerHTML = ..., where `card` IS that wrapper already).
//
// Configure via env vars (all required except the two DIR overrides):
//   TRANSLATION_SOURCE_DIR   base dir containing english-source/ and
//                            translated/ (defaults to ./  — i.e. run this
//                            from wherever those two folders live)
//   TRANSLATION_MODULES      comma-separated 0-indexed module list, e.g. "1,2"
//   TRANSLATION_CARD_COUNTS  matching comma-separated card counts, e.g. "4,3"
//   TRANSLATION_LANGUAGES    comma-separated language codes, e.g. "es,fr,de"
//
// Run with: node scripts/package-hand-translations.js
// ══════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SECRETS_PATH = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');
const OUT_DIR = path.join(ROOT, 'www', 'assets', 'translations');

const SOURCE_DIR = process.env.TRANSLATION_SOURCE_DIR || process.cwd();
const ENGLISH_DIR = path.join(SOURCE_DIR, 'english-source');
const TRANSLATED_DIR = path.join(SOURCE_DIR, 'translated');

const PBKDF2_ITERATIONS = 100000; // must match scripts/encrypt-modules.js

function parseIntList(envVal, name) {
  if (!envVal) throw new Error('Set ' + name + ' (comma-separated), e.g. "1,2"');
  return envVal.split(',').map((s) => parseInt(s.trim(), 10));
}
const MODULES = parseIntList(process.env.TRANSLATION_MODULES, 'TRANSLATION_MODULES');
const CARD_COUNT_LIST = parseIntList(process.env.TRANSLATION_CARD_COUNTS, 'TRANSLATION_CARD_COUNTS');
if (CARD_COUNT_LIST.length !== MODULES.length) {
  throw new Error('TRANSLATION_CARD_COUNTS must have the same length as TRANSLATION_MODULES');
}
const CARD_COUNTS = {};
MODULES.forEach((idx, i) => { CARD_COUNTS[idx] = CARD_COUNT_LIST[i]; });
const LANGUAGES = (process.env.TRANSLATION_LANGUAGES || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!LANGUAGES.length) throw new Error('Set TRANSLATION_LANGUAGES (comma-separated), e.g. "es,fr,de"');

function deriveAesKey(passphrase, saltBuf) {
  return crypto.pbkdf2Sync(passphrase, saltBuf, PBKDF2_ITERATIONS, 32, 'sha256');
}
function encrypt(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = deriveAesKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), ct: Buffer.concat([ct, tag]).toString('base64') };
}
// Mirrors what element.textContent produces in the browser (see
// translate.js's contentHashBrowser) — tags stripped to EMPTY (not a
// space), since real textContent never synthesizes whitespace at a tag
// boundary, so adjacent cells with no source whitespace between them
// (e.g. "<td>A</td><td>B</td>") must concatenate with no space here too.
function textContentApprox(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function contentHash(html) {
  return crypto.createHash('sha256').update(textContentApprox(html)).digest('base64').slice(0, 16);
}
function parseExistingKeys(mdText) {
  const result = { bundleKey: null, moduleKeys: {} };
  const bundleMatch = /## Bundle key[^\n]*\n\n`([^`]+)`/.exec(mdText);
  if (bundleMatch) result.bundleKey = bundleMatch[1];
  const moduleRe = /Module (\d+) — .+?\n`([^`]+)`/g;
  let m;
  while ((m = moduleRe.exec(mdText))) result.moduleKeys[parseInt(m[1], 10) - 1] = m[2];
  return result;
}
// Strips a single outer wrapper element, e.g. turns
// "<div class="dd-wrap">INNER</div>" into "INNER". Falls back to the
// input unchanged if it isn't a single-root fragment.
function stripOuterWrapper(html) {
  const m = /^\s*<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>([\s\S]*)<\/[a-zA-Z][a-zA-Z0-9-]*>\s*$/.exec(html.trim());
  return m ? m[1] : html;
}

function main() {
  const keys = parseExistingKeys(fs.readFileSync(SECRETS_PATH, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const lang of LANGUAGES) {
    const finalObj = {};
    let anyFlagged = false;

    for (const idx of MODULES) {
      const entries = [];
      for (let cardIdx = 0; cardIdx < CARD_COUNTS[idx]; cardIdx++) {
        const enPath = path.join(ENGLISH_DIR, `sec-${idx}-card-${cardIdx}.html`);
        const trPath = path.join(TRANSLATED_DIR, lang, `sec-${idx}-card-${cardIdx}.html`);
        if (!fs.existsSync(trPath)) throw new Error('Missing translation: ' + trPath);

        const englishHtml = fs.readFileSync(enPath, 'utf8');
        const translatedHtml = stripOuterWrapper(fs.readFileSync(trPath, 'utf8'));
        const hash = contentHash(englishHtml);

        // Structural sanity check, compared in the same scope (wrapper
        // stripped on both sides) — catches a corrupted/truncated
        // translation file loudly here instead of shipping it silently.
        const englishInner = stripOuterWrapper(englishHtml);
        const origTags = (englishInner.match(/<[a-zA-Z][^>]*>/g) || []).length;
        const newTags = (translatedHtml.match(/<[a-zA-Z][^>]*>/g) || []).length;
        const tagDelta = Math.abs(origTags - newTags);
        if (origTags > 0 && tagDelta > 2 && tagDelta / origTags > 0.15) {
          anyFlagged = true;
          console.log(`FLAGGED lang=${lang} sec-${idx} card-${cardIdx}: orig=${origTags} new=${newTags} tags`);
        }

        entries.push({
          hash,
          individual: encrypt(translatedHtml, keys.moduleKeys[idx]),
          bundle: encrypt(translatedHtml, keys.bundleKey + '::sec-' + idx)
        });
      }
      finalObj[idx] = entries;
    }

    const outPath = path.join(OUT_DIR, lang + '.js');
    const varName = 'PRETRANSLATED_' + lang.toUpperCase();
    fs.writeFileSync(outPath, 'window.' + varName + ' = ' + JSON.stringify(finalObj) + ';\n', 'utf8');
    const cardTotal = MODULES.reduce((s, idx) => s + finalObj[idx].length, 0);
    console.log(`${lang}: wrote ${outPath} (${cardTotal} cards)${anyFlagged ? ' [SEE FLAGS ABOVE]' : ''}`);
  }
}

main();
