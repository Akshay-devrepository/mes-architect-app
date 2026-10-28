// Verifies Firebase Auth ID tokens without the Admin SDK: RS256 signature
// against Google's published keys, plus the claim checks Firebase documents
// (aud = project id, iss = securetoken issuer, exp/iat/auth_time, sub).
import { HttpError } from './http.js';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const CLOCK_SKEW = 300;
let jwksCache = { keys: [], expires: 0, fetchedAt: 0 };

function b64urlBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function loadKeys(fetchImpl, now, force) {
  if (!force && jwksCache.keys.length && now < jwksCache.expires) return jwksCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new HttpError(503, 'auth_keys_unavailable');
  const body = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
  jwksCache = { keys: body.keys || [], expires: now + (maxAge ? parseInt(maxAge[1], 10) : 3600), fetchedAt: now };
  return jwksCache.keys;
}

export function resetKeyCache() {
  jwksCache = { keys: [], expires: 0, fetchedAt: 0 };
}

export async function verifyIdToken(token, env, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const fetchImpl = opts.fetch || fetch;
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new HttpError(500, 'auth_not_configured');

  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'invalid_token');
  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); }
  catch (e) { throw new HttpError(401, 'invalid_token'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new HttpError(401, 'invalid_token');

  let keys = await loadKeys(fetchImpl, now, false);
  let jwk = keys.find((k) => k.kid === header.kid);
  // Google rotates keys; refetch once (at most every 5 minutes) on an unknown kid.
  if (!jwk && now - jwksCache.fetchedAt > 300) {
    keys = await loadKeys(fetchImpl, now, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new HttpError(401, 'invalid_token');

  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) throw new HttpError(401, 'invalid_token');

  if (payload.aud !== projectId) throw new HttpError(401, 'invalid_token');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new HttpError(401, 'invalid_token');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new HttpError(401, 'invalid_token');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new HttpError(401, 'token_expired');
  if (typeof payload.iat !== 'number' || payload.iat > now + CLOCK_SKEW) throw new HttpError(401, 'invalid_token');
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now + CLOCK_SKEW) throw new HttpError(401, 'invalid_token');

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
    emailVerified: payload.email_verified === true
  };
}

export async function requireUser(request, env, opts) {
  const m = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) throw new HttpError(401, 'missing_token');
  return verifyIdToken(m[1], env, opts);
}
