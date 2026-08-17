// Batch script: pre-translate paid modules' cards into several languages,
// encrypt each translated card the same way the English original is
// encrypted (both individual-key and bundle-key variants), and write the
// result as static JS files the app can load with zero runtime API calls.
// Resumable — progress is checkpointed to disk after every successful
// card+language, so a crash/interrupt/quota-exhaustion just picks back up
// (already-cached chunks aren't re-translated).
//
// Run with: GROQ_API_KEY=gsk_... node scripts/generate-translations.js
// (never hardcode the key here — this file is committed).
//
// Edit PILOT_MODULES / LANGUAGES below to control what gets generated on
// a given run.

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'www', 'index.html');
const SECRETS_PATH = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');
const OUT_DIR = path.join(ROOT, 'www', 'assets', 'translations');
const CHECKPOINT_PATH = path.join(ROOT, '.translation-checkpoint.json'); // gitignored — safe to delete to force a full re-translate

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_TRANSLATE_MODEL = 'openai/gpt-oss-20b';
const PBKDF2_ITERATIONS = 100000;

if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith('gsk_')) {
  console.error('Set GROQ_API_KEY (a real key starting with gsk_) in the environment before running this script.');
  process.exit(1);
}

const PILOT_MODULES = [1, 2]; // 0-indexed: Module 2, Module 3
const LANGUAGES = {
  es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Mandarin Chinese', ar: 'Arabic', ja: 'Japanese'
};

const MAX_CHUNK_CHARS = 3200; // ~800 tokens of HTML — safely under the 8K TPM ceiling even with reasoning overhead

// ── crypto (mirrors scripts/encrypt-modules.js and assets/license.js) ──
function deriveAesKey(passphrase, saltBuf) {
  return crypto.pbkdf2Sync(passphrase, saltBuf, PBKDF2_ITERATIONS, 32, 'sha256');
}
function decrypt(encObj, passphrase) {
  const salt = Buffer.from(encObj.salt, 'base64');
  const iv = Buffer.from(encObj.iv, 'base64');
  const ctWithTag = Buffer.from(encObj.ct, 'base64');
  const tag = ctWithTag.subarray(ctWithTag.length - 16);
  const ct = ctWithTag.subarray(0, ctWithTag.length - 16);
  const key = deriveAesKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
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
// Hashes the NORMALIZED TEXT of a card, not its raw HTML — a browser
// reserializes markup on DOM round-trip (attribute quoting, entity
// encoding, etc.), so hashing exact bytes would make the runtime
// staleness check in translate.js spuriously fail even when nothing
// meaningful changed. Mirrors what element.textContent produces: strip
// tags to EMPTY (not a space) — real textContent never synthesizes
// whitespace at a tag boundary, so adjacent cells written with no source
// whitespace between them (e.g. "<td>A</td><td>B</td>") concatenate with
// no space too. Whatever whitespace ends up in the result is only what
// was already real text in the source (indentation/newlines between
// block-level tags), which the trailing collapse then normalizes.
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

function findBalancedDiv(html, openTagRegex, fromIndex) {
  openTagRegex.lastIndex = fromIndex || 0;
  const m = openTagRegex.exec(html);
  if (!m) return null;
  const innerStart = m.index + m[0].length;
  const tokenRe = /<div\b[^>]*>|<\/div>/g;
  tokenRe.lastIndex = innerStart;
  let depth = 1, tok;
  while ((tok = tokenRe.exec(html))) {
    if (tok[0] === '</div>') { depth--; if (depth === 0) return { innerStart, innerEnd: tok.index }; }
    else depth++;
  }
  throw new Error('Unbalanced <div> from index ' + fromIndex);
}

// ── generic top-level-child splitter (any tag, depth-balanced) ──
function splitTopLevelElements(inner) {
  const results = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>/g;
  const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
  let i = 0;
  while (i < inner.length) {
    tagRe.lastIndex = i;
    const m = tagRe.exec(inner);
    if (!m) { if (i < inner.length) results.push({ type: 'text', html: inner.slice(i) }); break; }
    if (m.index > i) results.push({ type: 'text', html: inner.slice(i, m.index) });
    const tagName = m[1].toLowerCase();
    const selfClosing = !!m[2] || VOID.has(tagName);
    if (selfClosing) { results.push({ type: 'element', html: m[0] }); i = m.index + m[0].length; continue; }
    const walkRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>/g;
    walkRe.lastIndex = m.index + m[0].length;
    let depth = 1, tok, endIdx = null;
    while ((tok = walkRe.exec(inner))) {
      const isClose = tok[0][1] === '/';
      const tName = tok[1].toLowerCase();
      if (!isClose && (!!tok[2] || VOID.has(tName))) continue;
      if (!isClose) depth++;
      else { depth--; if (depth === 0) { endIdx = tok.index + tok[0].length; break; } }
    }
    if (endIdx === null) throw new Error('Unbalanced tag <' + tagName + '> at ' + m.index);
    results.push({ type: 'element', html: inner.slice(m.index, endIdx) });
    i = endIdx;
  }
  return results;
}

// Recursively collects LEAF chunks (offset-anchored against the ORIGINAL
// `fullHtml` string) small enough to translate safely in one request.
function collectLeafChunks(fullHtml, start, end, maxChars, out) {
  const html = fullHtml.slice(start, end);
  if (html.length <= maxChars) { out.push({ start, end }); return; }
  const outerMatch = /^(\s*)<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>([\s\S]*)(<\/\2>)(\s*)$/.exec(html);
  if (!outerMatch) { out.push({ start, end }); return; } // can't decompose (e.g. a giant text run) — accept as-is
  const leadWs = outerMatch[1];
  const innerRelStart = leadWs.length + html.slice(leadWs.length).indexOf('>') + 1;
  const closeTag = outerMatch[4];
  const innerRelEnd = html.length - outerMatch[5].length - closeTag.length;
  const inner = html.slice(innerRelStart, innerRelEnd);
  const children = splitTopLevelElements(inner);
  if (!children.some(c => c.type === 'element')) { out.push({ start, end }); return; } // nothing to split further

  // Greedily pack consecutive siblings (elements + interleaving whitespace)
  // into groups up to maxChars, instead of recursing into every child
  // individually — a handful of small <tr>/<li> siblings become ONE
  // translation request, not one each. Only a single child that alone
  // exceeds maxChars gets recursed into on its own.
  let cursor = start + innerRelStart;
  let groupStart = cursor;
  // A group can end up pure whitespace (e.g. the "\n    " left dangling
  // right after a large sibling that got recursed into and reset the
  // group) — nothing to translate there, and sending it to the model just
  // produces a legitimate-but-useless empty completion. Skip it.
  const flush = (groupEnd) => {
    if (groupEnd > groupStart && fullHtml.slice(groupStart, groupEnd).trim().length > 0) {
      out.push({ start: groupStart, end: groupEnd });
    }
  };
  let groupLen = 0;
  for (const child of children) {
    const childLen = child.html.length;
    if (child.type === 'element' && childLen > maxChars) {
      flush(cursor);
      collectLeafChunks(fullHtml, cursor, cursor + childLen, maxChars, out);
      cursor += childLen;
      groupStart = cursor;
      groupLen = 0;
      continue;
    }
    if (groupLen > 0 && groupLen + childLen > maxChars) {
      flush(cursor);
      groupStart = cursor;
      groupLen = 0;
    }
    cursor += childLen;
    groupLen += childLen;
  }
  flush(cursor);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function parseGroqDurationMs(str) {
  if (!str) return null;
  if (/^[\d.]+ms$/.test(str)) return parseFloat(str);
  let ms = 0;
  const h = /([\d.]+)h/.exec(str), m = /([\d.]+)m(?!s)/.exec(str), s = /([\d.]+)s/.exec(str);
  if (h) ms += parseFloat(h[1]) * 3600000;
  if (m) ms += parseFloat(m[1]) * 60000;
  if (s) ms += parseFloat(s[1]) * 1000;
  return ms || null;
}

async function translateHtml(html, language) {
  const systemPrompt =
    'You translate small HTML fragments from a Manufacturing Execution System (MES) ' +
    'interview-prep app into ' + language + '. Rules, followed exactly:\n' +
    '1. Translate ONLY the human-readable prose text into ' + language + '.\n' +
    '2. Never change HTML tag names, attribute names, attribute values, class names, ' +
    'onclick handlers, or inline style attributes.\n' +
    '3. Never translate short technical/classification badges that look like standards, ' +
    'codes, or metrics (e.g. "ISA-95 Level 3", "OEE", "21 CFR Part 11") — keep those exactly as-is.\n' +
    '4. Preserve the exact HTML structure and tag nesting — do not add, remove, or reorder tags.\n' +
    '5. Return ONLY the resulting HTML fragment. No markdown code fences, no explanation, no commentary.';

  const MAX_ATTEMPTS = 5;
  let lastError = null;
  // Two failure modes need OPPOSITE remediation, so they're tracked
  // separately instead of a single per-attempt counter driving both:
  //  - empty response (model finished normally but wrote nothing to
  //    `content` — burned its whole budget on internal reasoning first) —
  //    give the NEXT attempt a bigger ceiling so reasoning has room to
  //    finish before hitting the limit.
  //  - 429/413 (rate-limited) — Requested is already prompt+max_tokens
  //    against an 8K/min cap; a BIGGER max_tokens only makes the next
  //    attempt request MORE and fail harder. Keep max_tokens as-is (or
  //    smaller) and just wait for the window to clear instead.
  let maxTokens = 4000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_API_KEY },
        body: JSON.stringify({
          model: GROQ_TRANSLATE_MODEL,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: html }],
          temperature: 0.2,
          max_tokens: maxTokens
        })
      });
    } catch (e) {
      lastError = e; await sleep(3000); continue; // network blip
    }

    if (res.status === 429 || res.status === 413) {
      const body = await res.json().catch(() => null);
      const message = (body && body.error && body.error.message) || '';
      const match = /try again in ([\d.]+)s/i.exec(message);
      const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500
        : (parseGroqDurationMs(res.headers.get('x-ratelimit-reset-tokens')) || 15000) + 500;
      lastError = new Error('rate-limited: ' + message);
      // A 413 that names a "Requested" figure well over the 8000 ceiling
      // means THIS max_tokens is structurally too big for this model's
      // window regardless of how long we wait — shrink it for the retry
      // instead of repeating the same doomed request.
      const reqMatch = /Requested (\d+)/.exec(message);
      if (reqMatch && parseInt(reqMatch[1], 10) > 7500 && maxTokens > 2000) {
        maxTokens = Math.max(2000, maxTokens - 1500);
      }
      if (attempt < MAX_ATTEMPTS) { await sleep(Math.min(waitMs, 70000)); continue; }
      throw lastError;
    }
    if (!res.ok) { lastError = new Error('HTTP ' + res.status); if (attempt < MAX_ATTEMPTS) { await sleep(3000); continue; } throw lastError; }

    const data = await res.json();
    const translated = data.choices?.[0]?.message?.content;
    if (!translated) {
      lastError = new Error('empty-response (finish_reason=' + data.choices?.[0]?.finish_reason + ')');
      maxTokens = Math.min(10000, maxTokens + 1500);
      if (attempt < MAX_ATTEMPTS) continue;
      throw lastError;
    }
    const s = translated.indexOf('<'), e = translated.lastIndexOf('>');
    const cleaned = (s !== -1 && e !== -1 && e > s) ? translated.slice(s, e + 1).trim() : translated.trim();
    const origTags = (html.match(/<[a-zA-Z][^>]*>/g) || []).length;
    const newTags = (cleaned.match(/<[a-zA-Z][^>]*>/g) || []).length;
    if (origTags > 0 && Math.abs(origTags - newTags) > Math.max(2, Math.round(origTags * 0.2))) {
      lastError = new Error('structure-mismatch (orig=' + origTags + ' new=' + newTags + ')');
      if (attempt < MAX_ATTEMPTS) continue; // retry structural failures too — often a one-off
      throw lastError;
    }
    return cleaned;
  }
  throw lastError;
}

function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8')); } catch (e) { return {}; }
}
function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp), 'utf8');
}

async function main() {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const keys = parseExistingKeys(fs.readFileSync(SECRETS_PATH, 'utf8'));
  const checkpoint = loadCheckpoint(); // { "1:es:0:2": "translatedHtml", ... }  key = module:lang:card:chunkIdx

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Decrypt each pilot module's English cards once.
  const moduleCards = {}; // idx -> [{ html, hash }]
  for (const idx of PILOT_MODULES) {
    const gateRe = new RegExp('<div class="locked-gate" data-module="' + idx + '"[^>]*data-individual=\'([^\']+)\'', 's');
    const m = gateRe.exec(html);
    if (!m) throw new Error('sec-' + idx + ' gate not found');
    const individualEnc = JSON.parse(m[1].replace(/&quot;/g, '"'));
    const plaintext = decrypt(individualEnc, keys.moduleKeys[idx]);
    const cardOpenRe = /<div class="(dd-wrap|q-box)"[^>]*>/g;
    const positions = [];
    let cm;
    while ((cm = cardOpenRe.exec(plaintext))) positions.push(cm.index);
    const cards = positions.map((pos) => {
      // Find THIS card's own matching close tag via depth-tracking — never
      // naively slice to the next card's start, which sweeps in trailing
      // comments/whitespace and produces an unbalanced fragment.
      const openRe = /<div class="(dd-wrap|q-box)"[^>]*>/g;
      openRe.lastIndex = pos;
      const om = openRe.exec(plaintext);
      const innerStart = om.index + om[0].length;
      const tokenRe = /<div\b[^>]*>|<\/div>/g;
      tokenRe.lastIndex = innerStart;
      let depth = 1, tok, cardEnd = null;
      while ((tok = tokenRe.exec(plaintext))) {
        if (tok[0] === '</div>') { depth--; if (depth === 0) { cardEnd = tok.index + tok[0].length; break; } }
        else depth++;
      }
      if (cardEnd === null) throw new Error('unbalanced card at ' + pos);
      return { html: plaintext.slice(pos, cardEnd) };
    });
    moduleCards[idx] = cards.map(c => ({ html: c.html, hash: contentHash(c.html) }));
    console.log('sec-' + idx + ': decrypted, ' + cards.length + ' cards');
  }

  const results = {}; // lang -> idx -> [{ hash, translatedHtml }]
  for (const idx of PILOT_MODULES) results[idx] = {};

  let totalCalls = 0, doneCalls = 0;
  const jobs = [];
  for (const idx of PILOT_MODULES) {
    for (const cardIdx in moduleCards[idx]) {
      for (const langCode of Object.keys(LANGUAGES)) {
        jobs.push({ idx, cardIdx: parseInt(cardIdx, 10), langCode });
      }
    }
  }
  console.log('Total card x language jobs: ' + jobs.length);

  for (const job of jobs) {
    const { idx, cardIdx, langCode } = job;
    const card = moduleCards[idx][cardIdx];
    const language = LANGUAGES[langCode];
    const resultKey = idx + ':' + langCode + ':' + cardIdx;

    if (!results[idx][langCode]) results[idx][langCode] = [];

    // Chunk this card.
    const chunks = [];
    collectLeafChunks(card.html, 0, card.html.length, MAX_CHUNK_CHARS, chunks);
    console.log('[' + resultKey + '] ' + chunks.length + ' chunk(s), ' + card.html.length + ' chars');

    let rebuilt = card.html;
    // Translate from LAST chunk to FIRST so earlier offsets stay valid as we splice.
    for (let ci = chunks.length - 1; ci >= 0; ci--) {
      const { start, end } = chunks[ci];
      const original = card.html.slice(start, end);
      const ckKey = idx + ':' + langCode + ':' + cardIdx + ':' + ci;
      let translated = checkpoint[ckKey];
      totalCalls++;
      if (translated === undefined) {
        try {
          translated = await translateHtml(original, language);
          checkpoint[ckKey] = translated;
          saveCheckpoint(checkpoint);
          doneCalls++;
          console.log('  chunk ' + ci + '/' + chunks.length + ' OK (' + doneCalls + '/' + totalCalls + ' so far)');
        } catch (e) {
          console.log('  chunk ' + ci + '/' + chunks.length + ' FAILED: ' + e.message + ' — keeping English for this chunk');
          translated = original;
          checkpoint[ckKey] = translated;
          saveCheckpoint(checkpoint);
        }
      } else {
        doneCalls++;
        console.log('  chunk ' + ci + '/' + chunks.length + ' cached');
      }
      rebuilt = rebuilt.slice(0, start) + translated + rebuilt.slice(end);
    }

    // translate.js does `card.innerHTML = translatedHtml` where `card` IS
    // the .dd-wrap/.q-box element itself (same convention the live-API
    // path already follows, since it reads/writes card.innerHTML too) —
    // so the OUTER wrapper tag captured for chunking purposes must be
    // stripped back off here, or the runtime nests a second copy of the
    // wrapper inside the original one.
    const innerMatch = /^\s*<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>([\s\S]*)<\/[a-zA-Z][a-zA-Z0-9-]*>\s*$/.exec(rebuilt);
    const innerOnly = innerMatch ? innerMatch[1] : rebuilt;

    results[idx][langCode].push({ cardIdx, hash: card.hash, translatedHtml: innerOnly });
  }

  // Encrypt each translated card (individual + bundle keys, matching English's scheme) and write per-language files.
  for (const langCode of Object.keys(LANGUAGES)) {
    const outObj = {};
    for (const idx of PILOT_MODULES) {
      outObj[idx] = (results[idx][langCode] || []).map(entry => ({
        hash: entry.hash,
        individual: encrypt(entry.translatedHtml, keys.moduleKeys[idx]),
        bundle: encrypt(entry.translatedHtml, keys.bundleKey + '::sec-' + idx)
      }));
    }
    const outPath = path.join(OUT_DIR, langCode + '.js');
    const varName = 'PRETRANSLATED_' + langCode.toUpperCase();
    fs.writeFileSync(outPath, 'window.' + varName + ' = ' + JSON.stringify(outObj) + ';\n', 'utf8');
    console.log('Wrote ' + outPath);
  }

  console.log('\nDONE. ' + doneCalls + '/' + totalCalls + ' chunks translated.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
