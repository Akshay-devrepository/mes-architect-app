# MES Architect API (Cloudflare Worker)

Accounts, purchases, content delivery and the AI proxy. Replaces the
"one shared license key decrypts everything in the browser" model:

| Before | With the backend |
|---|---|
| Paid modules ship to every visitor, encrypted with one shared key | Modules are served only to signed-in, verified buyers who own them |
| A leaked key unlocks everything forever | Access is per account; refunds revoke it automatically |
| Copies can't be traced | Every served module carries a "Licensed to b•••r@… · id" line |
| The Groq key is readable in the website source | The key lives only in the Worker; the AI prompt is built server-side |
| Buyers email you and wait for a key | Razorpay / Lemon Squeezy webhooks grant access within seconds |

Everything runs on free tiers (Cloudflare Workers + D1 + R2, Firebase Auth).

## How it fits together

- **Sign-in:** email + password through Firebase Auth's REST API (`www/assets/account.js`).
  The Worker verifies the RS256 ID token itself — signature against Google's keys,
  audience, issuer, expiry, subject.
- **Purchases:** `POST /api/webhooks/razorpay` and `/api/webhooks/lemonsqueezy`, both
  HMAC-verified, idempotent, recorded in D1 by the buyer's email. What a purchase
  unlocks comes from the Lemon Squeezy variant or the amount Razorpay captured —
  never from a checkout field the buyer can edit.
- **Access:** only for accounts whose email is verified (otherwise anyone could
  register a buyer's address and claim their purchase).
- **Content:** `GET /api/modules/:section` and `/translations/:lang`, from R2, with
  per-user daily download limits.
- **AI:** `POST /api/ai/chat` — requires the AI Interview Coach module (or bundle),
  rejects client-supplied system prompts, enforces a daily per-user limit, falls
  through the free Groq model chain, never forwards upstream error details.
- **Account deletion:** `DELETE /api/account` erases the account's usage counters
  and writes an `account_deleted` audit row; the app then deletes the Firebase
  sign-in with the user's own token (Play Store / GDPR erasure). Purchase rows are
  kept as financial records — they're keyed by email, not by the account.

Product codes use the on-screen module numbers: `bundle`, `module-02` … `module-17`.

## Go-live runbook

Run everything from the repo root unless noted. ~30–45 minutes.

### 1. Firebase (sign-in)
1. Create a project at console.firebase.google.com (Analytics not needed).
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Authentication → Settings → Authorized domains:** add `akshay-devrepository.github.io`.
4. **Project settings → General:** note the **Project ID** and **Web API key**.
5. In Google Cloud Console → APIs & Services → Credentials, edit that API key:
   - API restrictions: *Identity Toolkit API* and *Token Service API* only.
   - Website restrictions: `https://akshay-devrepository.github.io/*` and `https://localhost/*`
     (the Android app's WebView origin).

### 2. Cloudflare (the API)
```bash
cd backend
npx wrangler login
npx wrangler d1 create mes-architect          # paste the database_id into wrangler.toml
npx wrangler d1 execute mes-architect --remote --file=schema.sql
npx wrangler r2 bucket create mes-content
```
Set `FIREBASE_PROJECT_ID` in `wrangler.toml`, then the secrets:
```bash
npx wrangler secret put GROQ_API_KEY                 # create a NEW key at console.groq.com — the current one is public
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
npx wrangler secret put LEMONSQUEEZY_WEBHOOK_SECRET
npx wrangler deploy                                  # note the https://mes-architect-api.<you>.workers.dev URL
curl https://mes-architect-api.<you>.workers.dev/api/health
```

### 3. Content → R2
```bash
node scripts/export-content-for-r2.js
cd backend/.content-export
for f in $(find . -type f); do npx wrangler r2 object put "mes-content/${f#./}" --file "$f" --remote; done
cd ../.. && rm -rf backend/.content-export          # it's plaintext — don't keep it
```

### 4. Payments
**Lemon Squeezy** (international, handles VAT):
- Products: a *Full access* variant, and single modules as either one variant per
  module or one variant whose checkout carries `checkout[custom][module]=03`.
- Map variants in `wrangler.toml` → `LS_VARIANTS`, e.g.
  `{"123456":"bundle","123457":"module-choice"}`.
- Settings → Webhooks: `https://<worker>/api/webhooks/lemonsqueezy`, events
  `order_created` + `order_refunded`, signing secret = `LEMONSQUEEZY_WEBHOOK_SECRET`.

**Razorpay** (India, UPI):
- Payment Pages: bundle ₹2,499; single module ₹249 with a required dropdown field
  named **`module`** (values 02–17). Prices must match `RAZORPAY_PRICES` (paise).
- Settings → Webhooks: `https://<worker>/api/webhooks/razorpay`, events
  `payment.captured` + `refund.processed`, secret = `RAZORPAY_WEBHOOK_SECRET`.

Use each provider's **test mode** first. An order that can't be mapped returns 200
(so it isn't retried forever) and is recorded for you:
```bash
npx wrangler d1 execute mes-architect --remote --command "SELECT * FROM audit_log ORDER BY id DESC LIMIT 20"
```
Redeploy (`npx wrangler deploy`) after changing `wrangler.toml` vars.

### 5. Switch the app on
```bash
node scripts/set-backend-config.js https://mes-architect-api.<you>.workers.dev <firebase-web-api-key>
git add www/assets/backend-config.js www/index.html && git commit -m "Turn on backend mode" && git push
```
This sets the API address, adds it to the CSP and removes direct Groq access.
CI then stops injecting the Groq key into the public bundle. Afterwards:
1. Delete the `GROQ_API_KEY` GitHub secret.
2. **Revoke the old Groq key** in console.groq.com — it's in every previously deployed site and APK.

### 6. Existing license-key buyers
Grant them access by the email they bought with; they sign in and everything unlocks:
```bash
npx wrangler d1 execute mes-architect --remote --command "INSERT INTO purchases (provider, provider_ref, email, product, status) VALUES ('manual', 'legacy-001', 'buyer@example.com', 'bundle', 'paid')"
```
License keys keep working alongside accounts until you retire them (Phase C:
remove the encrypted modules from the public bundle and make the repo private).

## Local development
No accounts needed — the real Worker code, a Firebase sign-in stand-in and the
app on one origin:
```bash
node --disable-warning=ExperimentalWarning backend/dev/server.mjs
```
Open http://localhost:8788/index.html, create an account (verification is instant
locally), then simulate a purchase through the real signed webhook:
```bash
curl -X POST "http://localhost:8788/dev/buy?email=you@example.com&product=bundle"
```
Run `node scripts/export-content-for-r2.js` first to use real modules (delete the
export afterwards); set `GROQ_API_KEY` in the environment for real AI replies.

## Tests
`npm test` (repo root) runs `backend/test/*.test.mjs` against real SQLite (the actual
`schema.sql`), real RS256 tokens and real HMAC signatures — including forged tokens,
forged webhooks, checkout tampering, prompt injection and rate limits.

## Security notes (accepted risks)

- **Refresh token in localStorage** (CodeQL `js/clear-text-storage-of-sensitive-data`).
  Same place Firebase's own SDK keeps it. Encrypting it in the browser would be
  cosmetic — any script able to read it could also use a browser-held key or just
  act as the page. Mitigations: strict CSP (no inline script, allowlisted handlers),
  1-hour ID tokens, refresh tokens die on password change / account disable, Android
  backups excluded. Proper fix: an httpOnly cookie session, which needs the app and
  API on one custom domain (Phase C).
- **Content a buyer can read can be copied.** The goal is no free path, traceable
  copies (licensee line) and revocable access — not impossibility.
- **License keys still work** until the encrypted modules are removed from the public
  bundle (Phase C); until then the old shared-key exposure remains for key holders.

## Operations
- Daily limits: `AI_DAILY_LIMIT` (default 60) and `CONTENT_DAILY_LIMIT` (300) in `wrangler.toml`.
- Purchases: `SELECT email, product, status, provider, created_at FROM purchases ORDER BY id DESC LIMIT 50`
- Logs: one JSON line per request (`reqId`, `method`, `path`, `status`, `ms`) plus
  `unhandled` lines with the stack; never emails, tokens, bodies or query strings.
  Query them in the dashboard (Workers Logs, enabled by `[observability]` in
  `wrangler.toml`) or live with `npx wrangler tail --format json`.
- Every response carries `X-Request-Id`, and error bodies include `requestId` — ask
  a user for it to find the exact log line.
