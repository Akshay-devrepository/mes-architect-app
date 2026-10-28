#!/usr/bin/env node
// Turns on backend mode in one step, so the three places that must agree
// can't drift:
//   1. www/assets/backend-config.js  — apiBase + Firebase Web API key
//   2. index.html CSP connect-src     — adds the API origin, drops api.groq.com
//      (AI calls now go through the Worker, which holds the key)
//   3. CI stops injecting the Groq key into the public bundle on its own —
//      both workflows skip that step once apiBase is set.
//
//   node scripts/set-backend-config.js https://mes-architect-api.<you>.workers.dev <firebase-web-api-key>

const fs = require('fs');
const path = require('path');

const [apiBase, firebaseApiKey] = process.argv.slice(2);
let origin;
try { origin = new URL(apiBase).origin; } catch (e) { origin = null; }
if (!origin || !origin.startsWith('https://') || origin !== apiBase.replace(/\/+$/, '')) {
  console.error('Usage: node scripts/set-backend-config.js <https API origin, no path> <firebase web api key>');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{20,}$/.test(firebaseApiKey || '')) {
  console.error('That does not look like a Firebase Web API key.');
  process.exit(1);
}

const www = path.join(__dirname, '..', 'www');
const configFile = path.join(www, 'assets', 'backend-config.js');
let config = fs.readFileSync(configFile, 'utf8');
config = config
  .replace(/apiBase: [^,\n]+,/, "apiBase: '" + origin + "',")
  .replace(/firebaseApiKey: [^\n]+/, "firebaseApiKey: '" + firebaseApiKey + "'");
fs.writeFileSync(configFile, config);

const indexFile = path.join(www, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
html = html.replace(/(connect-src )([^;]*)(;)/, (m, a, sources, z) => {
  const list = sources.split(/\s+/).filter((s) => s && s !== 'https://api.groq.com' && s !== origin);
  return a + list.concat(origin).join(' ') + z;
});
fs.writeFileSync(indexFile, html);

console.log('Backend mode on: apiBase=' + origin + '. CSP connect-src now: ' + /connect-src ([^;]*);/.exec(html)[1]);
console.log('Next: commit + push. Then delete the GROQ_API_KEY GitHub secret — the Worker has its own copy.');
