// Shared by scripts/generate-translations.js: reading the license-key file,
// cutting module HTML into request-sized chunks without breaking tag
// nesting, and calling Groq to translate one chunk with rate-limit-aware
// retries. Pure functions plus one network call (injectable for tests).

function parseExistingKeys(mdText) {
  const result = { bundleKey: null, moduleKeys: {} };
  const bundleMatch = /## Bundle key[^\n]*\n\n`([^`]+)`/.exec(mdText);
  if (bundleMatch) result.bundleKey = bundleMatch[1];
  const moduleRe = /Module (\d+) — .+?\n`([^`]+)`/g;
  let m;
  while ((m = moduleRe.exec(mdText))) result.moduleKeys[parseInt(m[1], 10) - 1] = m[2];
  return result;
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

async function translateHtml(html, language, { apiKey, model, fetchImpl = fetch } = {}) {
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
      res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model,
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

module.exports = { parseExistingKeys, splitTopLevelElements, collectLeafChunks, translateHtml, sleep };
