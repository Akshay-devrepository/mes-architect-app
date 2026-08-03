#!/usr/bin/env node
// ══════════════════════════════════════════
// keygen-issue-license.js — run ONCE PER SALE.
//
// Issues one brand-new Keygen license key, scoped to the policy
// scripts/keygen-setup.js already created (2-device cap), with the real
// AES passphrase for the purchased module/bundle attached as its
// metadata.unlockKey. That's what the app actually decrypts with — the
// buyer only ever sees the Keygen key string this prints, never the raw
// passphrase (see www/assets/license.js's Keygen integration).
//
// IMPORTANT: run this again for every new sale of the same module. Never
// hand the same Keygen key to two different buyers — they'd share one
// 2-device pool between them instead of each getting their own 2 devices.
//
// Usage (PowerShell):
//   $env:KEYGEN_ACCOUNT_ID = "your-account-slug"
//   $env:KEYGEN_API_TOKEN = "your-admin-or-environment-token"
//   node scripts/keygen-issue-license.js 2        # Module 2 (ISA-95)
//   node scripts/keygen-issue-license.js bundle   # Full bundle
//
// Reads the real passphrase to attach from LICENSE-KEYS-SECRET.md — run
// node scripts/encrypt-modules.js first if that file doesn't exist yet.
// ══════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { POLICY_NAME, requireEnv, keygenRequest } = require('./keygen-common');

const ROOT = path.join(__dirname, '..');
const SECRETS_PATH = path.join(ROOT, 'LICENSE-KEYS-SECRET.md');

const MODULE_NAMES = [
  'MES Industry Overview', 'ISA-95 Deep Dive', 'ISA-88 Batch Control',
  'MES Functional Modules', 'Enterprise Architecture', 'Cloud Migration',
  'Database & Data Models', 'AI Interview Coach', 'Implementation Lifecycle',
  'Industry-Specific MES', 'Learning Roadmap', 'Concept Visualizations',
  'Consultant Mindset', 'Advanced Topics', 'MES Integration Deep Dive',
  'AI in Manufacturing', 'Mock Interview & Quiz Mode'
];

function parseKeys(mdText) {
  const result = { bundleKey: null, moduleKeys: {} };
  const bundleMatch = /## Bundle key[^\n]*\n\n`([^`]+)`/.exec(mdText);
  if (bundleMatch) result.bundleKey = bundleMatch[1];
  const moduleRe = /Module (\d+) — .+?\n`([^`]+)`/g;
  let m;
  while ((m = moduleRe.exec(mdText))) result.moduleKeys[parseInt(m[1], 10)] = m[2]; // 1-based, matches the CLI arg
  return result;
}

async function findPolicy(accountId, token) {
  const list = await keygenRequest(accountId, token, 'GET', '/policies');
  const policy = (list.data || []).find((p) => p.attributes.name === POLICY_NAME);
  if (!policy) throw new Error('No policy named "' + POLICY_NAME + '" found — run scripts/keygen-setup.js first.');
  return policy;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/keygen-issue-license.js <module-number 2-17 | bundle>');
    process.exit(1);
  }

  if (!fs.existsSync(SECRETS_PATH)) {
    console.error(SECRETS_PATH + ' not found — run node scripts/encrypt-modules.js first.');
    process.exit(1);
  }
  const keys = parseKeys(fs.readFileSync(SECRETS_PATH, 'utf8'));

  let unlockKey, label;
  if (target === 'bundle') {
    unlockKey = keys.bundleKey;
    label = 'Full bundle';
  } else {
    const n = parseInt(target, 10);
    unlockKey = keys.moduleKeys[n];
    label = 'Module ' + n + ' — ' + (MODULE_NAMES[n - 1] || '?');
  }
  if (!unlockKey) {
    console.error('No key found for "' + target + '" in ' + SECRETS_PATH);
    process.exit(1);
  }

  const accountId = requireEnv('KEYGEN_ACCOUNT_ID');
  const token = requireEnv('KEYGEN_API_TOKEN');

  const policy = await findPolicy(accountId, token);

  const created = await keygenRequest(accountId, token, 'POST', '/licenses', {
    data: {
      type: 'licenses',
      attributes: { name: label, metadata: { unlockKey } },
      relationships: { policy: { data: { type: 'policies', id: policy.id } } }
    }
  });

  const license = created.data;
  console.log('\n' + label);
  console.log('Keygen license key (send this to the buyer):');
  console.log(license.attributes.key);
  console.log('\nLicense record ID (your own reference — e.g. to revoke this one buyer later without touching anyone else\'s): ' + license.id);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
