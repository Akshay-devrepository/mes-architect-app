// End-to-end checks of the user journeys that don't need a license key.
// Run with `npm run test:e2e` (needs Playwright's Chromium).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, openApp } = require('./helpers');

let env;
before(async () => { env = await setup(); });
after(async () => { await env.teardown(); });

test('home renders every module card with no script errors', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  assert.equal(await page.locator('#homeGrid > *').count(), 20);
  assert.equal(await page.textContent('#topbarTitle'), 'Home');
  assert.deepEqual(errors, []);
  await context.close();
});

test('sidebar navigation opens a module and Back returns home', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('.nav-item[data-idx="0"]');
  assert.equal(await page.textContent('#topbarTitle'), '01 — Learning Roadmap');
  assert.ok(await page.isVisible('#sec-0'));
  await page.goBack();
  await page.waitForFunction(() => document.getElementById('sec-home').classList.contains('active'));
  assert.deepEqual(errors, []);
  await context.close();
});

test('a paid module shows its gate and rejects a wrong key', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('.nav-item[data-idx="1"]');
  const gate = page.locator('#sec-1 .locked-gate');
  assert.ok(await gate.isVisible());
  await gate.locator('.locked-key-input').fill('not-a-real-key');
  await gate.locator('.locked-error').waitFor({ state: 'hidden' });
  await gate.locator('button', { hasText: /unlock/i }).first().click();
  await gate.locator('.locked-error').waitFor({ state: 'visible' });
  assert.ok(!(await gate.evaluate((g) => g.classList.contains('unlocked'))));
  assert.deepEqual(errors, []);
  await context.close();
});

test('global search finds glossary terms', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('#searchToggleBtn');
  await page.fill('#searchInput', 'OEE');
  await page.waitForFunction(() => /Availability × Performance × Quality/.test(document.getElementById('searchResults').textContent));
  assert.deepEqual(errors, []);
  await context.close();
});

test('glossary filter narrows the term list', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('.nav-item[data-idx="18"]');
  await page.fill('#glossarySearch', 'traceability');
  await page.waitForFunction(() => /\b1 of \d+ terms/.test(document.getElementById('glossary-root').textContent));
  assert.match(await page.textContent('#glossary-root'), /Genealogy \/ Traceability/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('text size setting persists across a reload', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('#settingsToggleBtn');
  await page.click('#textSizeIncBtn');
  const size = await page.textContent('#textSizeDisplay');
  assert.notEqual(size, '100%');
  await page.reload();
  await page.waitForSelector('#homeGrid > *');
  assert.equal(await page.textContent('#textSizeDisplay'), size);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the free module never asks a new user to "re-enter" a license key', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('.nav-item[data-idx="0"]');
  // No translations exist for it yet, so the controls are hidden outright.
  await page.locator('#sec-0 .translate-controls').waitFor({ state: 'hidden' });
  assert.doesNotMatch(await page.textContent('#sec-0 .translate-controls'), /re-enter/i);
  assert.deepEqual(errors, []);
  await context.close();
});

test('phone-width layout has no horizontal page scroll', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl, { viewport: { width: 360, height: 780 } });
  for (const idx of [null, 0, 1, 18, 19]) {
    if (idx !== null) await page.evaluate((i) => window.showSection(i), idx);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'horizontal overflow of ' + overflow + 'px on section ' + idx);
  }
  await context.close();
});

test('the app shell still loads offline once the service worker has cached it', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // first controlled load fills the runtime cache
  await page.waitForSelector('#homeGrid > *');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#homeGrid > *');
  assert.equal(await page.locator('#homeGrid > *').count(), 20);
  await context.setOffline(false);
  assert.deepEqual(errors.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), []);
  await context.close();
});

test('uncaught errors are kept for bug reports, with keys and emails scrubbed', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('boom MES-M03-abcDEF123 for buyer@example.com'); });
  });
  await page.waitForFunction(() => window.MESDiagnostics.recent().length > 0);
  const summary = await page.evaluate(() => window.MESDiagnostics.summary());
  assert.match(summary, /boom \[key\] for \[email\]/);
  assert.doesNotMatch(summary, /abcDEF123|buyer@example\.com/);
  await context.close();
});

test('the privacy policy is linked from Settings and opens', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  await page.click('#settingsToggleBtn');
  await page.click('#settingsPanel a[href="privacy.html"]');
  await page.waitForURL(/privacy\.html$/);
  assert.match(await page.textContent('h1'), /Privacy Policy/);
  assert.deepEqual(errors, []);
  await context.close();
});
