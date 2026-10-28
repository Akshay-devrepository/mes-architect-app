// Paid content served only to entitled, verified accounts, from R2.
// Each module gets a visible licensee line so a leaked copy is traceable.
import { HttpError, json, escapeHtml, sha256Hex } from './http.js';
import { entitledSections, withinDailyLimit } from './entitlements.js';

const LANGS = new Set(['zh', 'de', 'fr', 'ja', 'ko', 'it']);

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return '';
  return name.slice(0, 1) + '•••' + name.slice(-1) + '@' + domain;
}

export async function licenseeMark(user) {
  const id = (await sha256Hex('licensee:' + user.uid)).slice(0, 10);
  // .licensee-mark is skipped by translate.js's block list, so it never
  // shifts translation indexes.
  return '<div class="licensee-mark">Licensed to ' + escapeHtml(maskEmail(user.email)) +
    ' · ' + escapeHtml(id) + ' · personal use only</div>';
}

async function requireSection(env, user, section) {
  if (!user.emailVerified) throw new HttpError(403, 'email_not_verified');
  const owned = await entitledSections(env, user.email);
  if (!owned.includes(section)) throw new HttpError(403, 'not_entitled');
  const limit = parseInt(env.CONTENT_DAILY_LIMIT || '300', 10);
  if (!(await withinDailyLimit(env, user.uid, 'content', limit))) throw new HttpError(429, 'daily_content_limit');
}

export async function handleModule(env, user, section) {
  await requireSection(env, user, section);
  const obj = await env.CONTENT.get('modules/' + section + '.html');
  if (!obj) throw new HttpError(404, 'not_found');
  return json({ section, html: (await obj.text()) + (await licenseeMark(user)) }, 200, { 'Cache-Control': 'private, no-store' });
}

export async function handleTranslation(env, user, section, lang) {
  if (!LANGS.has(lang)) throw new HttpError(404, 'not_found');
  await requireSection(env, user, section);
  const obj = await env.CONTENT.get('translations/' + lang + '/' + section + '.json');
  if (!obj) throw new HttpError(404, 'not_found');
  return json({ section, lang, blocks: JSON.parse(await obj.text()) }, 200, { 'Cache-Control': 'private, no-store' });
}
