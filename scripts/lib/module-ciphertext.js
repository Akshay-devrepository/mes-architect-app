// Where each paid module's ciphertext lives, in one place for every build
// script. Since the monolith split, each locked module's two AES-GCM
// payloads are www/assets/modules/sec-<idx>.json ({ individual, bundle })
// and index.html carries only an empty .locked-gate placeholder. The legacy
// layout (both payloads inline as data-individual / data-bundle attributes)
// is still read so these scripts work on a checkout from before the split.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MODULES_DIR = path.join(ROOT, 'www', 'assets', 'modules');
const INDEX_PATH = path.join(ROOT, 'www', 'index.html');

const LEGACY_GATE_RE = /<div class="locked-gate" data-module="(\d+)" data-individual='([^']*)' data-bundle='([^']*)'>/g;
const GATE_RE = /<div class="locked-gate" data-module="(\d+)"[^>]*>/g;

function moduleFile(idx, dir = MODULES_DIR) {
  return path.join(dir, 'sec-' + idx + '.json');
}

// -> { [idx]: { individual: {salt,iv,ct}, bundle: {salt,iv,ct} } }, in
// the order the gates appear in index.html.
function readModuleCiphertexts({ indexPath = INDEX_PATH, modulesDir = MODULES_DIR } = {}) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const out = {};
  let m;
  LEGACY_GATE_RE.lastIndex = 0;
  while ((m = LEGACY_GATE_RE.exec(html))) {
    out[m[1]] = { individual: JSON.parse(m[2]), bundle: JSON.parse(m[3]) };
  }
  GATE_RE.lastIndex = 0;
  while ((m = GATE_RE.exec(html))) {
    if (out[m[1]]) continue;
    const file = moduleFile(m[1], modulesDir);
    if (!fs.existsSync(file)) throw new Error('index.html locks sec-' + m[1] + ' but ' + path.relative(ROOT, file) + ' is missing');
    out[m[1]] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return out;
}

module.exports = { readModuleCiphertexts, moduleFile, MODULES_DIR, LEGACY_GATE_RE };
