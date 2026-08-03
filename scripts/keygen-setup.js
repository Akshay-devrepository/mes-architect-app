#!/usr/bin/env node
// ══════════════════════════════════════════
// keygen-setup.js — ONE-TIME setup. Creates the Keygen Product and Policy
// this app's Keygen integration (see README "Selling licensed access" and
// www/assets/license.js) expects, with the exact policy attributes needed
// to cap every license at 2 device activations:
//   authenticationStrategy: LICENSE, floating: true, maxMachines: 2,
//   strict: true (without this, maxMachines is silently NOT enforced),
//   overageStrategy: NO_OVERAGE
//
// Safe to re-run — looks up an existing product/policy by name first and
// reuses it instead of creating a duplicate.
//
// Requires an admin or environment API token from your Keygen dashboard
// (Products/Policies/Licenses creation needs one of those two token types
// — a plain "product token" can't create the product itself). Never paste
// that token into a committed file; pass it as an environment variable.
//
// Run with (PowerShell):
//   $env:KEYGEN_ACCOUNT_ID = "your-account-slug"
//   $env:KEYGEN_API_TOKEN = "your-admin-or-environment-token"
//   node scripts/keygen-setup.js
// ══════════════════════════════════════════

const { PRODUCT_CODE, PRODUCT_NAME, POLICY_NAME, requireEnv, keygenRequest } = require('./keygen-common');

async function findProduct(accountId, token) {
  const list = await keygenRequest(accountId, token, 'GET', '/products');
  return (list.data || []).find((p) => p.attributes.code === PRODUCT_CODE) || null;
}

async function findPolicy(accountId, token, productId) {
  const list = await keygenRequest(accountId, token, 'GET', '/policies');
  return (list.data || []).find((p) =>
    p.attributes.name === POLICY_NAME &&
    p.relationships.product.data.id === productId
  ) || null;
}

async function main() {
  const accountId = requireEnv('KEYGEN_ACCOUNT_ID');
  const token = requireEnv('KEYGEN_API_TOKEN');

  let product = await findProduct(accountId, token);
  if (product) {
    console.log('Product already exists: ' + product.id + ' (reusing)');
  } else {
    const created = await keygenRequest(accountId, token, 'POST', '/products', {
      data: {
        type: 'products',
        attributes: { name: PRODUCT_NAME, code: PRODUCT_CODE, distributionStrategy: 'LICENSED' }
      }
    });
    product = created.data;
    console.log('Created product: ' + product.id);
  }

  let policy = await findPolicy(accountId, token, product.id);
  if (policy) {
    console.log('Policy already exists: ' + policy.id + ' (reusing)');
  } else {
    const created = await keygenRequest(accountId, token, 'POST', '/policies', {
      data: {
        type: 'policies',
        attributes: {
          name: POLICY_NAME,
          authenticationStrategy: 'LICENSE',
          floating: true,
          maxMachines: 2,
          strict: true,
          overageStrategy: 'NO_OVERAGE'
        },
        relationships: { product: { data: { type: 'products', id: product.id } } }
      }
    });
    policy = created.data;
    console.log('Created policy: ' + policy.id + ' (maxMachines: 2, strict: true)');
  }

  console.log('\nSetup complete. Every license scripts/keygen-issue-license.js issues from here on');
  console.log('will be capped at 2 device activations.');
  console.log('\nNext: set KEYGEN_ACCOUNT_ID = \'' + accountId + '\' in www/assets/license.js, then redeploy.');
}

main().catch((err) => { console.error(err.message); process.exit(1); });
