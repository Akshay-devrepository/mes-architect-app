// Test doubles that behave like the Worker runtime: a D1-shaped wrapper over
// real SQLite (the actual schema.sql), an R2-shaped Map, RS256 tokens signed
// like Firebase's, and HMAC-signed webhook bodies.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handle } from '../src/index.js';
import { resetKeyCache } from '../src/auth.js';

const SCHEMA = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url)), 'utf8');
export const PROJECT = 'mes-test-project';
export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const statement = (sql, args = []) => ({
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), success: true }),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; }
  });
  return { prepare: (sql) => statement(sql), raw: db };
}

export function makeR2(entries = {}) {
  const store = new Map(Object.entries(entries));
  return { get: async (key) => (store.has(key) ? { text: async () => store.get(key) } : null) };
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function makeSigner(kid = 'test-kid') {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid, alg: 'RS256', use: 'sig' };
  async function token(claims = {}, header = {}) {
    const now = Math.floor(Date.now() / 1000);
    const h = { alg: 'RS256', kid, typ: 'JWT', ...header };
    const p = {
      aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub: 'user-1',
      iat: now - 10, auth_time: now - 10, exp: now + 3600,
      email: 'buyer@example.com', email_verified: true, ...claims
    };
    const input = b64url(JSON.stringify(h)) + '.' + b64url(JSON.stringify(p));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(input));
    return input + '.' + b64url(sig);
  }
  return { jwk, token };
}

export function makeEnv(overrides = {}) {
  return {
    DB: makeD1(),
    CONTENT: makeR2({
      'modules/3.html': '<div class="dd-wrap"><button onclick="toggleDD(this)">ISA-88 deep dive</button></div>',
      'modules/15.html': '<div>AI coach module</div>',
      'translations/de/3.json': JSON.stringify([{ hash: 'abc', html: '<div>Deutsch</div>' }])
    }),
    FIREBASE_PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: 'https://akshay-devrepository.github.io,https://localhost',
    LS_VARIANTS: JSON.stringify({ 111: 'bundle', 222: 'module-04', 333: 'module-choice' }),
    RAZORPAY_PRICES: JSON.stringify({ bundle: 249900, module: 24900 }),
    LEMONSQUEEZY_WEBHOOK_SECRET: 'ls-secret',
    RAZORPAY_WEBHOOK_SECRET: 'rzp-secret',
    GROQ_API_KEY: 'gsk_server_side_only',
    AI_DAILY_LIMIT: '3',
    CONTENT_DAILY_LIMIT: '50',
    ...overrides
  };
}

export function makeHarness(signer, env = makeEnv(), groq = defaultGroq()) {
  resetKeyCache();
  const authFetch = async (url) => {
    if (url !== JWKS_URL) throw new Error('unexpected auth fetch ' + url);
    return new Response(JSON.stringify({ keys: [signer.jwk] }), { headers: { 'Cache-Control': 'public, max-age=3600' } });
  };
  const call = async (method, path, { token, body, headers = {}, raw } = {}) => {
    const h = new Headers(headers);
    if (token) h.set('Authorization', 'Bearer ' + token);
    if (body !== undefined && !raw) h.set('Content-Type', 'application/json');
    const req = new Request('https://api.test' + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    return handle(req, env, { auth: { fetch: authFetch }, fetch: groq.fetch });
  };
  return { env, call, groq };
}

export function defaultGroq(statuses = []) {
  const calls = [];
  let i = 0;
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      const status = statuses[i++] ?? 200;
      if (status !== 200) return new Response(JSON.stringify({ error: { message: 'org_secret_detail' } }), { status });
      return new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    }
  };
}

export function signedWebhook(secret, payload) {
  const raw = JSON.stringify(payload);
  return { raw, sig: createHmac('sha256', secret).update(raw).digest('hex') };
}

export async function grant(env, email, product, provider = 'manual', ref = Math.random().toString(36).slice(2)) {
  await env.DB.prepare("INSERT INTO purchases (provider, provider_ref, email, product, status) VALUES (?, ?, ?, ?, 'paid')")
    .bind(provider, ref, email, product).run();
}
