// License unlock, end to end, without the real keys: every
// assets/modules/sec-N.json request is answered with a fixture module
// encrypted (same AES-GCM/PBKDF2 format as scripts/encrypt-modules.js) with
// throwaway test keys. The service worker is blocked in these contexts so
// the page's own fetches are the ones being routed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../../scripts/lib/crypto-utils');
const { setup, openApp } = require('./helpers');

const LOCKED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const BUNDLE_KEY = 'TEST-BUNDLE-KEY';
const individualKey = (idx) => 'MES-M' + String(idx + 1).padStart(2, '0') + '-test';
const fixtureHtml = (idx) =>
  '<div class="dd-wrap"><div class="dd-header" data-onclick="toggleDD(this)">' +
  '<div class="dd-label">Fixture</div><div class="dd-title">Fixture concept ' + idx + '</div></div>' +
  '<div class="dd-body"><div class="dd-summary-text">Fixture summary for module ' + idx + '.</div></div></div>' +
  (idx === 16 ? '<div id="quiz-root"></div>' : '');

let env;
const fixtures = {};
before(async () => {
  env = await setup();
  for (const idx of LOCKED) {
    fixtures[idx] = JSON.stringify({
      individual: encrypt(fixtureHtml(idx), individualKey(idx)),
      bundle: encrypt(fixtureHtml(idx), BUNDLE_KEY + '::sec-' + idx)
    });
  }
});
after(async () => { await env.teardown(); });

async function openWithFixtures() {
  const fetched = [];
  const app = await openApp(env.browser, env.baseUrl, {
    contextOptions: { serviceWorkers: 'block' },
    beforeLoad: (context) => context.route(/\/assets\/modules\/sec-(\d+)\.json$/, (route) => {
      const idx = Number(/sec-(\d+)\.json$/.exec(route.request().url())[1]);
      fetched.push(idx);
      route.fulfill({ status: 200, contentType: 'application/json', body: fixtures[idx] });
    })
  });
  return { ...app, fetched };
}

const lockedCount = (page) => page.locator('.locked-gate:not(.unlocked)').count();

test('a cold start downloads no paid-module ciphertext', async () => {
  const { page, fetched, errors, context } = await openWithFixtures();
  await page.waitForLoadState('networkidle');
  assert.deepEqual(fetched, []);
  assert.equal(await lockedCount(page), LOCKED.length);
  assert.deepEqual(errors, []);
  await context.close();
});

test('an individual key unlocks only its module, fetches only its file, and survives reload', async () => {
  const { page, fetched, errors, context } = await openWithFixtures();
  await page.click('.nav-item[data-idx="1"]');
  const gate = page.locator('#sec-1 .locked-gate');
  await gate.locator('.locked-key-input').fill(individualKey(1));
  await gate.locator('.locked-unlock-btn').click();
  await page.locator('#sec-1 .dd-title', { hasText: 'Fixture concept 1' }).waitFor();
  assert.deepEqual(fetched, [1]);
  assert.equal(await lockedCount(page), LOCKED.length - 1);

  fetched.length = 0;
  await page.reload();
  await page.waitForSelector('#homeGrid > *');
  assert.equal(await page.locator('#sec-1 .locked-gate.unlocked').count(), 1, 'restored from the offline cache');
  assert.deepEqual(fetched, [], 'restoring needs no download');
  assert.deepEqual(errors, []);
  await context.close();
});

test('a bundle key in the sidebar unlocks every module', async () => {
  const { page, errors, context } = await openWithFixtures();
  await page.fill('#globalLicenseInput', BUNDLE_KEY);
  await page.click('#globalLicenseRow button:has-text("Apply")');
  await page.waitForFunction((n) => /Unlocked \d+ module/.test(document.getElementById('globalLicenseStatus').textContent), LOCKED.length);
  assert.equal(await lockedCount(page), 0);
  assert.match(await page.textContent('#globalLicenseStatus'), new RegExp('Unlocked ' + LOCKED.length + ' modules'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('an individual key in the sidebar is matched to its module without trying the rest', async () => {
  const { page, fetched, context } = await openWithFixtures();
  await page.fill('#globalLicenseInput', individualKey(7));
  await page.click('#globalLicenseRow button:has-text("Apply")');
  await page.waitForFunction(() => /Unlocked 1 module/.test(document.getElementById('globalLicenseStatus').textContent));
  assert.deepEqual(fetched, [7]);
  await context.close();
});

test('a failed download says so instead of blaming the key', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl, {
    contextOptions: { serviceWorkers: 'block' },
    beforeLoad: (c) => c.route(/\/assets\/modules\//, (route) => route.abort('internetdisconnected'))
  });
  await page.click('.nav-item[data-idx="2"]');
  const gate = page.locator('#sec-2 .locked-gate');
  await gate.locator('.locked-key-input').fill(individualKey(2));
  await gate.locator('.locked-unlock-btn').click();
  await gate.locator('.locked-error').waitFor({ state: 'visible' });
  assert.match(await gate.locator('.locked-error').textContent(), /connection/);
  await context.close();
});

test('bookmarking a card (by keyboard) lists it under Saved', async () => {
  const { page, errors, context } = await openWithFixtures();
  await page.fill('#globalLicenseInput', individualKey(3));
  await page.click('#globalLicenseRow button:has-text("Apply")');
  await page.evaluate(() => window.showSection(3));
  const star = page.locator('#sec-3 .star-btn').first();
  await star.waitFor();
  await star.focus();
  await page.keyboard.press('Enter');
  assert.equal(await star.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => window.showSection(17));
  assert.match(await page.textContent('#saved-root'), /Fixture concept 3/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the service worker pre-caches every module file for offline unlocking', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async (n) => {
    const names = await caches.keys();
    let count = 0;
    for (const name of names) {
      const keys = await (await caches.open(name)).keys();
      count += keys.filter((r) => /\/assets\/modules\/sec-\d+\.json$/.test(r.url)).length;
    }
    return count === n;
  }, LOCKED.length, { timeout: 30000 });
  await context.close();
});

test('unlocked module content passes axe WCAG 2.1 AA (serious + critical)', async () => {
  const { AxeBuilder } = require('@axe-core/playwright');
  const { page, context } = await openWithFixtures();
  await page.fill('#globalLicenseInput', individualKey(4));
  await page.click('#globalLicenseRow button:has-text("Apply")');
  await page.evaluate(() => window.showSection(4));
  await page.locator('#sec-4 .star-btn').waitFor();
  const r = await new AxeBuilder({ page }).include('#sec-4').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
  assert.deepEqual(bad, []);
  await context.close();
});

test('translations made by generate-translations.js are offered and applied by the app', async () => {
  // Run the real generator on module 4's fixture with the same test keys.
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { run } = require('../../scripts/generate-translations');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-e2e-'));
  fs.mkdirSync(path.join(root, 'www', 'assets', 'modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'www', 'index.html'), '<div class="locked-gate" data-module="3"></div>');
  fs.writeFileSync(path.join(root, 'www', 'assets', 'modules', 'sec-3.json'), fixtures[3]);
  const keysMd = '## Bundle key\n\n`' + BUNDLE_KEY + '`\n\n**Module 4 — ISA-88 Batch Control**  \n`' + individualKey(3) + '`\n';
  const fake = async (html, language) => html.replace(/>([^<]+)</g, (m, t) => '>' + (t.trim() ? language + ': ' + t : t) + '<');
  const result = await run({ rootDir: root, langs: ['fr'], modules: [3], keysMd, translate: fake, log: () => {} });
  assert.ok(result.complete);
  const frJs = fs.readFileSync(path.join(root, 'www', 'assets', 'translations', 'fr.js'), 'utf8');
  const table = JSON.parse(/=\s*(\{[\s\S]*\});\s*$/.exec(frJs)[1]);
  const manifestJs = 'window.PRETRANSLATED_MANIFEST = ' + JSON.stringify({ fr: { 3: table['3'].map((e) => e.hash) } }) + ';\n';

  const { page, errors, context } = await openWithFixtures();
  await context.route(/\/assets\/translations-manifest\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: manifestJs }));
  await context.route(/\/assets\/translations\/fr\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: frJs }));
  await page.reload();
  await page.waitForSelector('#homeGrid > *');
  await page.fill('#globalLicenseInput', individualKey(3));
  await page.click('#globalLicenseRow button:has-text("Apply")');
  await page.evaluate(() => window.showSection(3));
  const select = page.locator('#sec-3 .translate-lang-select');
  await page.waitForFunction(() => [...document.querySelectorAll('#sec-3 .translate-lang-select option')].some((o) => o.value === 'French'));
  await select.selectOption('French');
  await page.click('#sec-3 .translate-btn');
  await page.locator('#sec-3 .dd-title', { hasText: 'French: Fixture concept 3' }).waitFor();
  assert.match(await page.textContent('#sec-3 .translate-status'), /Translated all/);
  assert.deepEqual(errors, []);
  await context.close();
});
