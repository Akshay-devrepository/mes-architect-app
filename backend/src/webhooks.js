// Purchase webhooks. Both providers sign the raw body with HMAC-SHA256;
// anything unsigned or mis-signed is rejected before it's parsed.
// What a purchase unlocks is decided server-side (variant id / amount
// captured), never from fields the buyer can edit at checkout.
import { HttpError, json } from './http.js';
import { productToSections, normalizeModuleChoice, audit } from './entitlements.js';

async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifiedBody(request, secret, headerName) {
  if (!secret) throw new HttpError(500, 'webhook_not_configured');
  const raw = await request.text();
  const given = (request.headers.get(headerName) || '').trim().toLowerCase();
  if (!constantTimeEqual(await hmacHex(secret, raw), given)) throw new HttpError(401, 'bad_signature');
  try { return JSON.parse(raw); } catch (e) { throw new HttpError(400, 'bad_json'); }
}

async function recordPurchase(env, p) {
  await env.DB.prepare(
    'INSERT INTO purchases (provider, provider_ref, email, product, status, amount, currency) ' +
    "VALUES (?, ?, ?, ?, 'paid', ?, ?) ON CONFLICT (provider, provider_ref) DO NOTHING"
  ).bind(p.provider, p.ref, p.email, p.product, p.amount ?? null, p.currency ?? null).run();
  await audit(env, 'purchase', p.email, { provider: p.provider, ref: p.ref, product: p.product });
}

async function recordRefund(env, provider, ref) {
  await env.DB.prepare(
    "UPDATE purchases SET status = 'refunded', updated_at = datetime('now') WHERE provider = ? AND provider_ref = ?"
  ).bind(provider, ref).run();
  await audit(env, 'refund', null, { provider, ref });
}

function parseJsonVar(value, fallback) {
  try { return JSON.parse(value || ''); } catch (e) { return fallback; }
}

export async function handleLemonSqueezy(request, env) {
  const evt = await verifiedBody(request, env.LEMONSQUEEZY_WEBHOOK_SECRET, 'X-Signature');
  const name = evt.meta && evt.meta.event_name;
  const orderId = evt.data && evt.data.id != null ? String(evt.data.id) : '';
  const a = (evt.data && evt.data.attributes) || {};
  if (!orderId) throw new HttpError(400, 'missing_order');

  if (name === 'order_refunded') {
    await recordRefund(env, 'lemonsqueezy', orderId);
    return json({ ok: true, refunded: orderId });
  }
  if (name !== 'order_created') return json({ ok: true, ignored: name || 'unknown_event' });
  if (a.status !== 'paid') return json({ ok: true, ignored: 'not_paid' });

  const variantId = a.first_order_item && a.first_order_item.variant_id;
  let product = parseJsonVar(env.LS_VARIANTS, {})[String(variantId)];
  if (product === 'module-choice') {
    product = normalizeModuleChoice(evt.meta && evt.meta.custom_data && evt.meta.custom_data.module);
  }
  const email = String(a.user_email || '').trim().toLowerCase();
  if (!product || !productToSections(product) || !email) {
    // 200 so the provider doesn't retry forever; the audit row tells the operator.
    await audit(env, 'purchase_unmapped', email, { provider: 'lemonsqueezy', ref: orderId, variantId });
    return json({ ok: true, ignored: 'unmapped' });
  }
  await recordPurchase(env, { provider: 'lemonsqueezy', ref: orderId, email, product, amount: a.total, currency: a.currency });
  return json({ ok: true, granted: product });
}

export async function handleRazorpay(request, env) {
  const evt = await verifiedBody(request, env.RAZORPAY_WEBHOOK_SECRET, 'X-Razorpay-Signature');
  const payload = evt.payload || {};

  if (evt.event === 'refund.processed') {
    const refund = payload.refund && payload.refund.entity;
    if (!refund || !refund.payment_id) throw new HttpError(400, 'missing_payment');
    await recordRefund(env, 'razorpay', refund.payment_id);
    return json({ ok: true, refunded: refund.payment_id });
  }
  if (evt.event !== 'payment.captured') return json({ ok: true, ignored: evt.event || 'unknown_event' });

  const pay = payload.payment && payload.payment.entity;
  if (!pay || !pay.id) throw new HttpError(400, 'missing_payment');
  const email = String(pay.email || '').trim().toLowerCase();
  const prices = parseJsonVar(env.RAZORPAY_PRICES, {});
  let product = null;
  if (pay.currency === 'INR' && prices.bundle && pay.amount >= prices.bundle) {
    product = 'bundle';
  } else if (pay.currency === 'INR' && prices.module && pay.amount >= prices.module) {
    product = normalizeModuleChoice(pay.notes && pay.notes.module);
  }
  if (!product || !email) {
    await audit(env, 'purchase_unmapped', email, { provider: 'razorpay', ref: pay.id, amount: pay.amount, currency: pay.currency });
    return json({ ok: true, ignored: 'unmapped' });
  }
  await recordPurchase(env, { provider: 'razorpay', ref: pay.id, email, product, amount: pay.amount, currency: pay.currency });
  return json({ ok: true, granted: product });
}
