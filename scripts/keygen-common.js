// ══════════════════════════════════════════
// keygen-common.js — shared helpers for scripts/keygen-setup.js and
// scripts/keygen-issue-license.js. Not run directly.
//
// PRODUCT_CODE/PRODUCT_NAME/POLICY_NAME are shared identifiers both scripts
// look up by (not IDs) so keygen-issue-license.js never needs a UUID passed
// around by hand — it just re-finds the policy keygen-setup.js already
// created, by name.
// ══════════════════════════════════════════

const KEYGEN_API_BASE = 'https://api.keygen.sh/v1';
const PRODUCT_CODE = 'mes-architect';
const PRODUCT_NAME = 'MES Architect';
const POLICY_NAME = 'MES Architect — Standard (2 devices)';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error('Missing required environment variable: ' + name);
    process.exit(1);
  }
  return value;
}

async function keygenRequest(accountId, token, method, urlPath, body) {
  const res = await fetch(KEYGEN_API_BASE + '/accounts/' + accountId + urlPath, {
    method,
    headers: {
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
      'Authorization': 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json && json.errors && json.errors[0] && (json.errors[0].detail || json.errors[0].title);
    throw new Error('Keygen API ' + method + ' ' + urlPath + ' failed (' + res.status + '): ' + (detail || res.statusText));
  }
  return json;
}

module.exports = { KEYGEN_API_BASE, PRODUCT_CODE, PRODUCT_NAME, POLICY_NAME, requireEnv, keygenRequest };
