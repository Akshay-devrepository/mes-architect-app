// One JSON object per line, so Workers Logs / `wrangler tail` can filter and
// aggregate on fields. Never log tokens, emails, request bodies or query
// strings — only what's needed to correlate and diagnose.
export function log(level, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// Cloudflare's ray id when present (matches its dashboard), else a fresh id.
export function requestId(request) {
  const ray = request.headers.get('cf-ray');
  return ray && /^[\w-]{1,64}$/.test(ray) ? ray : crypto.randomUUID();
}
