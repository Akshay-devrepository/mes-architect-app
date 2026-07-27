#!/usr/bin/env node
// ══════════════════════════════════════════
// encrypt-modules.js — one-time/repeatable BUILD step.
//
// Locks the paid modules' content behind a license key: for each module in
// LOCKED_MODULES, everything after its .section-header (title/tag/desc,
// which stays visible as a free teaser) is AES-256-GCM encrypted TWICE —
// once with that module's own individual key, once with a key derived from
// the shared bundle master key — and the plaintext is replaced in
// www/index.html with the ciphertext plus a locked-gate placeholder.
//
// Run with: node scripts/encrypt-modules.js
//
// Outputs:
//   - www/index.html is rewritten in place (safe to commit — only
//     ciphertext goes in, never a plaintext key).
//   - LICENSE-KEYS-SECRET.md is written at the repo root — the ONLY copy of
//     the actual keys. It is gitignored. NEVER commit it, paste it into a
//     public issue, or send it anywhere but directly to yourself.
//
// Re-running this script re-generates ALL keys (invalidating any already
// sold!). To rotate a single module's key without touching the rest, this
// script would need to be extended to read back existing keys first — as
// shipped it always does a full fresh encryption of every locked module.
// ══════════════════════════════════════════

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'www', 'index.html');
const SECRETS_PATH = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');

// sec-0 (MES Industry Overview) stays free as a trial. Quiz Mode (16) and
// Saved (17) are app features, not sellable content — never lock those.
const LOCKED_MODULES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const MODULE_NAMES = [
  'MES Industry Overview', 'ISA-95 Deep Dive', 'ISA-88 Batch Control',
  'MES Functional Modules', 'Enterprise Architecture', 'Cloud Migration',
  'Database & Data Models', 'AI Interview Coach', 'Implementation Lifecycle',
  'Industry-Specific MES', 'Learning Roadmap', 'Concept Visualizations',
  'Consultant Mindset', 'Advanced Topics', 'MES Integration Deep Dive',
  'AI in Manufacturing'
];

const PBKDF2_ITERATIONS = 100000;

function randomKey(prefix) {
  return prefix + '-' + crypto.randomBytes(15).toString('base64url');
}

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
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // Web Crypto's AES-GCM expects the auth tag appended to the ciphertext.
    ct: Buffer.concat([ct, tag]).toString('base64')
  };
}

// ── Balanced-div extraction (comment markers in this file are inconsistent,
//    so we track actual <div>/</div> nesting depth instead). ──
function findBalancedDiv(html, openTagRegex, fromIndex) {
  openTagRegex.lastIndex = fromIndex || 0;
  const m = openTagRegex.exec(html);
  if (!m) return null;
  const innerStart = m.index + m[0].length;
  const tokenRe = /<div\b[^>]*>|<\/div>/g;
  tokenRe.lastIndex = innerStart;
  let depth = 1;
  let tok;
  while ((tok = tokenRe.exec(html))) {
    if (tok[0] === '</div>') {
      depth--;
      if (depth === 0) {
        return { outerStart: m.index, openTag: m[0], innerStart, innerEnd: tok.index, outerEnd: tok.index + tok[0].length };
      }
    } else {
      depth++;
    }
  }
  throw new Error('Unbalanced <div> while scanning from index ' + fromIndex);
}

function main() {
  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  const bundleKey = randomKey('MES-BUNDLE');
  const secretLines = [
    '# MES Architect — License Keys (SECRET — do not commit or share this file)',
    '',
    'Generated: ' + new Date().toISOString(),
    '',
    '## Bundle key (unlocks all ' + LOCKED_MODULES.length + ' paid modules)',
    '',
    '`' + bundleKey + '`',
    '',
    '## Individual module keys',
    ''
  ];

  // Process highest index first so earlier offsets in `html` stay valid
  // as we splice each module's content out (edits later in the string
  // don't shift positions of anything earlier).
  const modules = [...LOCKED_MODULES].sort((a, b) => b - a);

  for (const idx of modules) {
    const sectionRe = new RegExp('<div class="section"[^>]*\\bid="sec-' + idx + '"[^>]*>', 'g');
    const section = findBalancedDiv(html, sectionRe, 0);
    if (!section) throw new Error('sec-' + idx + ' not found');

    const sectionInner = html.slice(section.innerStart, section.innerEnd);
    const headerRe = /<div class="section-header">/g;
    const header = findBalancedDiv(sectionInner, headerRe, 0);
    if (!header) throw new Error('section-header not found in sec-' + idx);

    const headerHtml = sectionInner.slice(0, header.outerEnd);
    const bodyHtml = sectionInner.slice(header.outerEnd);

    const individualKey = randomKey('MES-M' + String(idx + 1).padStart(2, '0'));
    const individualEnc = encrypt(bodyHtml, individualKey);
    const bundleEnc = encrypt(bodyHtml, bundleKey + '::sec-' + idx);

    const gate =
      headerHtml +
      '<div class="locked-gate" data-module="' + idx + '" ' +
      'data-individual=\'' + JSON.stringify(individualEnc) + '\' ' +
      'data-bundle=\'' + JSON.stringify(bundleEnc) + '\'>' +
        '<div class="locked-icon">🔒</div>' +
        '<div class="locked-title">This module is part of the paid content</div>' +
        '<div class="locked-desc">Enter your license key to unlock it on this device. One bundle key unlocks every module; an individual key unlocks just this one.</div>' +
        '<div class="locked-input-row">' +
          '<input type="text" class="locked-key-input" placeholder="Paste your license key" autocomplete="off" autocapitalize="off" spellcheck="false">' +
          '<button class="locked-unlock-btn" onclick="tryUnlockGate(this)">Unlock</button>' +
        '</div>' +
        '<div class="locked-error" style="display:none">That key didn’t unlock this module — check for typos.</div>' +
      '</div>' +
      '<div class="unlocked-content" style="display:none"></div>';

    html = html.slice(0, section.innerStart) + gate + html.slice(section.innerEnd);

    secretLines.push('**Module ' + (idx + 1) + ' — ' + MODULE_NAMES[idx] + '**  ');
    secretLines.push('`' + individualKey + '`');
    secretLines.push('');

    console.log('Locked sec-' + idx + ' (' + MODULE_NAMES[idx] + ') — individual key generated');
  }

  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  fs.writeFileSync(SECRETS_PATH, secretLines.join('\n') + '\n', 'utf8');
  console.log('\nWrote ' + INDEX_PATH);
  console.log('Wrote ' + SECRETS_PATH + ' (gitignored — this is the only copy of the keys)');
}

main();
