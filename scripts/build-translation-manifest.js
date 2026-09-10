// Builds www/assets/translations-manifest.js — a tiny (hashes-only) index
// of what every translations/<lang>.js file covers, so the app can decide
// which languages to offer per module WITHOUT eagerly downloading the full
// ~10 MB of encrypted translation ciphertext. The big per-language files
// are fetched on demand (translate.js) the first time a user picks that
// language.
//
// Run by both CI workflows before build/deploy so it can never drift from
// the committed translations/*.js. Safe to run locally too.
//
//   node scripts/build-translation-manifest.js

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'www', 'assets', 'translations');
const OUT = path.join(__dirname, '..', 'www', 'assets', 'translations-manifest.js');
const LANGS = ['fr', 'de', 'zh', 'ja', 'ko', 'it'];

const manifest = {};
for (const lang of LANGS) {
  const file = path.join(DIR, lang + '.js');
  if (!fs.existsSync(file)) {
    console.warn('skip ' + lang + '.js (not found)');
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  const m = /window\.PRETRANSLATED_\w+\s*=\s*(\{[\s\S]*\});?\s*$/.exec(src);
  if (!m) throw new Error('unrecognized format in ' + lang + '.js');
  const table = JSON.parse(m[1]);
  const byModule = {};
  for (const idx of Object.keys(table)) {
    byModule[idx] = table[idx].map((entry) => entry.hash);
  }
  manifest[lang] = byModule;
}

fs.writeFileSync(OUT, 'window.PRETRANSLATED_MANIFEST = ' + JSON.stringify(manifest) + ';\n', 'utf8');

const bytes = fs.statSync(OUT).size;
const modCount = Object.values(manifest).reduce((s, m) => s + Object.keys(m).length, 0);
const hashCount = Object.values(manifest).reduce(
  (s, m) => s + Object.values(m).reduce((t, arr) => t + arr.length, 0), 0);
console.log('wrote ' + path.relative(process.cwd(), OUT) +
  ' — ' + Object.keys(manifest).length + ' languages, ' + modCount + ' module entries, ' +
  hashCount + ' block hashes, ' + (bytes / 1024).toFixed(1) + ' KB');
