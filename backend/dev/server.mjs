// Local end-to-end harness — no cloud accounts needed.
// One origin serves: the app (www/), the real Worker (src/index.js) on
// /api/*, and a minimal Firebase Auth REST stand-in, so the whole buyer
// journey can be exercised in a browser:
//   sign up -> verify email -> purchase webhook -> modules unlock ->
//   translate -> AI coach -> sign out.
//
//   node --disable-warning=ExperimentalWarning backend/dev/server.mjs
//   open http://localhost:8788/index.html
//
// Simulate a purchase (goes through the real, signed Lemon Squeezy webhook):
//   POST http://localhost:8788/dev/buy?email=you@example.com&product=bundle
//   POST http://localhost:8788/dev/buy?email=you@example.com&product=module-04
//
// Content: real modules from backend/.content-export/ if you've run
// scripts/export-content-for-r2.js, else a few sample modules.
// AI: real Groq if GROQ_API_KEY is set in the environment, else a stub.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/index.js';
import { makeSigner, makeEnv, signedWebhook, JWKS_URL } from '../test/helpers.mjs';

const PORT = parseInt(process.env.PORT || '8788', 10);
const ORIGIN = 'http://localhost:' + PORT;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.resolve(HERE, '..', '..', 'www');
const EXPORT = path.resolve(HERE, '..', '.content-export');

const signer = await makeSigner('dev-kid');
const env = makeEnv({
  ALLOWED_ORIGINS: ORIGIN,
  LS_VARIANTS: JSON.stringify({ 1: 'bundle', 2: 'module-choice' }),
  AI_DAILY_LIMIT: '200',
  CONTENT_DAILY_LIMIT: '1000',
  GROQ_API_KEY: process.env.GROQ_API_KEY || 'dev-stub'
});
if (existsSync(EXPORT)) {
  env.CONTENT = { get: async (key) => {
    const file = path.join(EXPORT, key);
    if (!file.startsWith(EXPORT) || !existsSync(file)) return null;
    const text = await readFile(file, 'utf8');
    return { text: async () => text };
  } };
}

const authFetch = async (url) => {
  if (url !== JWKS_URL) throw new Error('unexpected auth fetch');
  return new Response(JSON.stringify({ keys: [signer.jwk] }), { headers: { 'Cache-Control': 'max-age=3600' } });
};
const groqFetch = process.env.GROQ_API_KEY ? fetch : async (url, init) => {
  const body = JSON.parse(init.body);
  const level = /The user (is new to MES|has [^.]+ experience|'s experience level is unknown)/.exec(body.messages[0].content);
  const text = '[dev stub · ' + body.model + ' · level: ' + (level ? level[1] : '?') + '] You asked: ' + body.messages[body.messages.length - 1].content;
  const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n' +
    'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n';
  return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
};

// ── Firebase Auth REST stand-in (just the calls account.js makes) ──
const users = new Map();     // email -> { uid, password, verified }
const refreshTokens = new Map(); // token -> email
let uidSeq = 0;
const fbError = (message) => new Response(JSON.stringify({ error: { code: 400, message } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
async function issue(email) {
  const u = users.get(email);
  const refreshToken = 'rt-' + Math.random().toString(36).slice(2);
  refreshTokens.set(refreshToken, email);
  const idToken = await signer.token({ sub: u.uid, email, email_verified: u.verified });
  return { idToken, refreshToken, expiresIn: '3600', email, localId: u.uid };
}
const payloadOf = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

async function firebase(pathname, request) {
  if (pathname.endsWith('/token')) {
    const form = new URLSearchParams(await request.text());
    const email = refreshTokens.get(form.get('refresh_token'));
    if (!email) return fbError('INVALID_REFRESH_TOKEN');
    const t = await issue(email);
    return Response.json({ id_token: t.idToken, refresh_token: t.refreshToken, expires_in: '3600' });
  }
  const body = await request.json();
  const method = pathname.split('accounts:')[1];
  const email = String(body.email || '').toLowerCase();
  if (method === 'signUp') {
    if (users.has(email)) return fbError('EMAIL_EXISTS');
    if (!body.password || body.password.length < 6) return fbError('WEAK_PASSWORD : Password should be at least 6 characters');
    users.set(email, { uid: 'dev-uid-' + (++uidSeq), password: body.password, verified: false });
    return Response.json(await issue(email));
  }
  if (method === 'signInWithPassword') {
    const u = users.get(email);
    if (!u || u.password !== body.password) return fbError('INVALID_LOGIN_CREDENTIALS');
    return Response.json(await issue(email));
  }
  if (method === 'sendOobCode') {
    if (body.requestType === 'VERIFY_EMAIL') {
      const who = payloadOf(body.idToken).email;
      users.get(who).verified = true; // dev: "clicking the email link" happens instantly
      console.log('[dev] verification link "clicked" for', who);
    }
    return Response.json({ email: email || 'ok' });
  }
  return fbError('UNSUPPORTED');
}

// ── Purchase simulation through the real signed webhook ──
async function devBuy(url) {
  const email = url.searchParams.get('email');
  const product = url.searchParams.get('product') || 'bundle';
  const variant = product === 'bundle' ? 1 : 2;
  const order = {
    meta: { event_name: 'order_created', custom_data: { module: product } },
    data: { id: 'dev-' + Date.now(), attributes: { status: 'paid', user_email: email, total: 999, currency: 'USD', first_order_item: { variant_id: variant } } }
  };
  const { raw, sig } = signedWebhook(env.LEMONSQUEEZY_WEBHOOK_SECRET, order);
  return handle(new Request(ORIGIN + '/api/webhooks/lemonsqueezy', { method: 'POST', headers: { 'X-Signature': sig }, body: raw }), env);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const DEV_CONFIG = "window.MES_BACKEND = { apiBase: location.origin, firebaseApiKey: 'dev-key', authBase: location.origin + '/identitytoolkit/v1', tokenBase: location.origin + '/securetoken/v1' };\n";

async function serveStatic(pathname) {
  if (pathname === '/assets/backend-config.js') return new Response(DEV_CONFIG, { headers: { 'Content-Type': 'text/javascript' } });
  const file = path.resolve(WWW, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(WWW + path.sep) || !existsSync(file)) return new Response('not found', { status: 404 });
  return new Response(await readFile(file), { headers: { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, ORIGIN);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req),
      duplex: 'half'
    });
    let response;
    if (url.pathname.startsWith('/api/')) response = await handle(request, env, { auth: { fetch: authFetch }, fetch: groqFetch });
    else if (url.pathname.startsWith('/identitytoolkit/') || url.pathname.startsWith('/securetoken/')) response = await firebase(url.pathname, request);
    else if (url.pathname === '/dev/buy' && req.method === 'POST') response = await devBuy(url);
    else response = await serveStatic(url.pathname);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500); res.end('dev server error');
  }
}).listen(PORT, () => {
  console.log('MES Architect dev backend on ' + ORIGIN + ' (content: ' + (existsSync(EXPORT) ? 'real export' : 'samples') + ', AI: ' + (process.env.GROQ_API_KEY ? 'real Groq' : 'stub') + ')');
});
