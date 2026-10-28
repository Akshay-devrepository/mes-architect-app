// Product codes use the on-screen module numbers buyers and the seller see
// ("module-03" = "Module 03 · ISA-95"). Internally each paid module is its
// section index, sec-N = on-screen number minus one (sec-1 .. sec-16).
export const PAID_SECTIONS = Array.from({ length: 16 }, (_, i) => i + 1);
export const AI_COACH_SECTION = 15; // "Module 16 · AI Interview Coach"

export function productToSections(product) {
  if (product === 'bundle') return PAID_SECTIONS;
  const m = /^module-(\d{2})$/.exec(product || '');
  if (!m) return null;
  const sec = parseInt(m[1], 10) - 1;
  return PAID_SECTIONS.includes(sec) ? [sec] : null;
}

// Accepts "03", "3", "module-03" or "Module 03 — ISA-95 ..." (a dropdown
// label) and returns the canonical "module-NN", or null.
export function normalizeModuleChoice(value) {
  const m = /(\d{1,2})/.exec(String(value || ''));
  if (!m) return null;
  const product = 'module-' + m[1].padStart(2, '0');
  return productToSections(product) ? product : null;
}

export async function entitledSections(env, email) {
  if (!email) return [];
  const { results } = await env.DB
    .prepare("SELECT product FROM purchases WHERE email = ? AND status = 'paid'")
    .bind(email)
    .all();
  const sections = new Set();
  for (const row of results || []) (productToSections(row.product) || []).forEach((s) => sections.add(s));
  return [...sections].sort((a, b) => a - b);
}

export async function audit(env, event, subject, detail) {
  await env.DB.prepare('INSERT INTO audit_log (event, subject, detail) VALUES (?, ?, ?)')
    .bind(event, subject || null, detail ? JSON.stringify(detail) : null)
    .run();
}

// Increments today's counter and reports whether it's still within limit.
export async function withinDailyLimit(env, uid, kind, limit) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB
    .prepare('INSERT INTO usage (uid, kind, day, count) VALUES (?, ?, ?, 1) ' +
      'ON CONFLICT (uid, kind, day) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(uid, kind, day)
    .first();
  return row.count <= limit;
}
