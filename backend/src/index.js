import { HttpError, json, corsHeaders, withHeaders } from './http.js';
import { requireUser } from './auth.js';
import { entitledSections, PAID_SECTIONS, AI_COACH_SECTION } from './entitlements.js';
import { handleLemonSqueezy, handleRazorpay } from './webhooks.js';
import { handleModule, handleTranslation } from './content.js';
import { handleChat } from './ai.js';

const MODULE_PATH = /^\/api\/modules\/(\d{1,2})$/;
const TRANSLATION_PATH = /^\/api\/modules\/(\d{1,2})\/translations\/([a-z]{2})$/;

function paidSection(raw) {
  const n = parseInt(raw, 10);
  if (!PAID_SECTIONS.includes(n)) throw new HttpError(404, 'not_found');
  return n;
}

async function route(request, env, deps) {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/api/health' && method === 'GET') return json({ ok: true });
  if (pathname === '/api/webhooks/razorpay' && method === 'POST') return handleRazorpay(request, env);
  if (pathname === '/api/webhooks/lemonsqueezy' && method === 'POST') return handleLemonSqueezy(request, env);

  const user = await requireUser(request, env, deps.auth);

  if (pathname === '/api/me' && method === 'GET') {
    const sections = user.emailVerified ? await entitledSections(env, user.email) : [];
    return json({ email: user.email, emailVerified: user.emailVerified, sections });
  }
  let m;
  if ((m = MODULE_PATH.exec(pathname)) && method === 'GET') {
    return handleModule(env, user, paidSection(m[1]));
  }
  if ((m = TRANSLATION_PATH.exec(pathname)) && method === 'GET') {
    return handleTranslation(env, user, paidSection(m[1]), m[2]);
  }
  if (pathname === '/api/ai/chat' && method === 'POST') {
    if (!user.emailVerified) throw new HttpError(403, 'email_not_verified');
    if (!(await entitledSections(env, user.email)).includes(AI_COACH_SECTION)) throw new HttpError(403, 'not_entitled');
    return handleChat(request, env, user, deps.fetch);
  }
  throw new HttpError(404, 'not_found');
}

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    return withHeaders(await route(request, env, deps), cors);
  } catch (e) {
    const known = e instanceof HttpError;
    if (!known) console.error(e && e.stack ? e.stack : e);
    return withHeaders(json({ error: known ? e.code : 'internal_error' }, known ? e.status : 500), cors);
  }
}

export default {
  fetch: (request, env) => handle(request, env)
};
