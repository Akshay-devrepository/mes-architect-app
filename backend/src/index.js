import { HttpError, json, corsHeaders, withHeaders } from './http.js';
import { log, requestId } from './log.js';
import { requireUser } from './auth.js';
import { entitledSections, audit, PAID_SECTIONS, AI_COACH_SECTION } from './entitlements.js';
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
  if (pathname === '/api/account' && method === 'DELETE') {
    return deleteAccountData(env, user);
  }
  if (pathname === '/api/ai/chat' && method === 'POST') {
    if (!user.emailVerified) throw new HttpError(403, 'email_not_verified');
    if (!(await entitledSections(env, user.email)).includes(AI_COACH_SECTION)) throw new HttpError(403, 'not_entitled');
    return handleChat(request, env, user, deps.fetch);
  }
  throw new HttpError(404, 'not_found');
}

// Account deletion (Play Store / GDPR "right to erasure"). The app deletes
// the Firebase sign-in itself with the user's own token; this removes what
// the API holds about the account. Purchase rows are kept — they are
// financial records needed for tax, refunds and chargebacks — and are
// keyed by email, not by this account, so nothing here links to them.
async function deleteAccountData(env, user) {
  await env.DB.prepare('DELETE FROM usage WHERE uid = ?').bind(user.uid).run();
  await audit(env, 'account_deleted', user.uid);
  return json({ deleted: true, retained: ['purchase records (legal obligation)'] });
}

export async function handle(request, env, deps = {}) {
  const started = Date.now();
  const reqId = requestId(request);
  const cors = { ...corsHeaders(request, env), 'X-Request-Id': reqId };
  const path = new URL(request.url).pathname;
  let status = 500;
  try {
    if (request.method === 'OPTIONS') { status = 204; return new Response(null, { status, headers: cors }); }
    const res = withHeaders(await route(request, env, deps), cors);
    status = res.status;
    return res;
  } catch (e) {
    const known = e instanceof HttpError;
    status = known ? e.status : 500;
    if (!known) log('error', 'unhandled', { reqId, path, error: e && e.name, message: e && e.message, stack: e && e.stack });
    // reqId lets a user's bug report be matched to the log line.
    return withHeaders(json({ error: known ? e.code : 'internal_error', requestId: reqId }, status), cors);
  } finally {
    log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'request',
      { reqId, method: request.method, path, status, ms: Date.now() - started });
  }
}

export default {
  fetch: (request, env) => handle(request, env)
};
