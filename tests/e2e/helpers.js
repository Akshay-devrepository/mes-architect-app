// Shared harness for the browser tests: a tiny static server over www/
// (no http-server process to manage) plus one Chromium per test file.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../www');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, baseUrl: 'http://localhost:' + server.address().port + '/' });
  }));
}

// Opens a fresh page and records anything that would show up as a red error
// in DevTools, so every test can assert the app stayed error-free.
async function openApp(browser, baseUrl, { viewport } = {}) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  // Hermetic: Keygen.sh, Groq, GitHub and fonts are never reached, so a
  // test can't pass or fail on someone else's uptime. Code that calls them
  // must cope with the network being down anyway.
  await context.route((url) => url.origin !== new URL(baseUrl).origin, (route) => route.abort('blockedbyclient'));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(m.text())) errors.push('console: ' + m.text());
  });
  await page.goto(baseUrl);
  await page.waitForSelector('#homeGrid > *');
  return { context, page, errors };
}

async function setup() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch();
  return { server, baseUrl, browser, async teardown() { await browser.close(); server.close(); } };
}

module.exports = { setup, openApp };
