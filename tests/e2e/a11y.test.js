// Accessibility gate: no serious/critical axe-core WCAG 2.1 AA violations
// on the main screens, plus the keyboard paths axe can't judge.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { AxeBuilder } = require('@axe-core/playwright');
const { setup, openApp } = require('./helpers');

let env;
before(async () => { env = await setup(); });
after(async () => { await env.teardown(); });

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function seriousViolations(page) {
  // Panels slide/fade in; auditing mid-transition measures half-faded text.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id + ' ×' + v.nodes.length + ' (' + v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ') + ')');
}

test('main screens pass axe WCAG 2.1 AA (serious + critical)', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  for (const idx of [null, 0, 1, 17, 18, 19]) {
    if (idx !== null) await page.evaluate((i) => window.showSection(i), idx);
    assert.deepEqual(await seriousViolations(page), [], 'screen ' + (idx === null ? 'home' : idx));
  }
  for (const open of ['openSettingsPanel', 'openFeedbackModal', 'openSearchPanel']) {
    await page.evaluate((fn) => window[fn](), open);
    assert.deepEqual(await seriousViolations(page), [], open);
    await page.keyboard.press('Escape');
  }
  await context.close();
});

test('sidebar modules are reachable and activatable from the keyboard', async () => {
  const { page, errors, context } = await openApp(env.browser, env.baseUrl);
  const item = page.locator('.nav-item[data-idx="0"]');
  assert.equal(await item.getAttribute('role'), 'button');
  assert.equal(await item.getAttribute('tabindex'), '0');
  await item.focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.textContent('#topbarTitle'), '01 — Learning Roadmap');
  assert.equal(await item.getAttribute('aria-current'), 'page');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Escape closes a dialog and returns focus to the button that opened it', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  await page.focus('#settingsToggleBtn');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.classList.contains('settings-open'));
  assert.equal(await page.getAttribute('#settingsPanel', 'role'), 'dialog');
  assert.ok(await page.evaluate(() => document.getElementById('settingsPanel').contains(document.activeElement)), 'focus moved into the dialog');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('settings-open'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'settingsToggleBtn');
  await context.close();
});

test('arrow keys scroll and type instead of hijacking navigation', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  await page.evaluate(() => window.showSection(18));
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => currentSection), 18, 'ArrowDown must not change module');
  await page.focus('#glossarySearch');
  await page.keyboard.type('oee');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => currentSection), 18, 'ArrowLeft inside a field must not change module');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => currentSection), 19, 'ArrowRight on the page still goes to the next module');
  await context.close();
});

test('the sales and privacy pages pass axe WCAG 2.1 AA (serious + critical)', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl);
  for (const file of ['buy.html', 'privacy.html']) {
    await page.goto(env.baseUrl + file);
    assert.deepEqual(await seriousViolations(page), [], file);
  }
  await context.close();
});

test('controls on a phone are at least 24px tall and wide (WCAG 2.2 target size)', async () => {
  const { page, context } = await openApp(env.browser, env.baseUrl, { viewport: { width: 412, height: 915 } });
  const tooSmall = async () => page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24); })
      .map((e) => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  assert.deepEqual(await tooSmall(), [], 'home');
  await page.click('#settingsToggleBtn');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  assert.deepEqual(await tooSmall(), [], 'settings');
  await context.close();
});
