-- One row per paid order. Entitlements are derived from these rows, keyed
-- by the buyer's (verified) email — never by anything the app sends.
CREATE TABLE IF NOT EXISTS purchases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT    NOT NULL,              -- 'razorpay' | 'lemonsqueezy' | 'manual'
  provider_ref TEXT    NOT NULL,              -- payment / order id at the provider
  email        TEXT    NOT NULL,              -- lowercased
  product      TEXT    NOT NULL,              -- 'bundle' | 'module-NN' (NN = on-screen module number, 02-17)
  status       TEXT    NOT NULL CHECK (status IN ('paid', 'refunded')),
  amount       INTEGER,                       -- minor units (paise / cents)
  currency     TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_ref)             -- webhook retries are idempotent
);
CREATE INDEX IF NOT EXISTS purchases_by_email ON purchases (email);

-- Per-user daily counters for rate limits (AI calls, module downloads).
CREATE TABLE IF NOT EXISTS usage (
  uid   TEXT    NOT NULL,
  kind  TEXT    NOT NULL,
  day   TEXT    NOT NULL,                     -- YYYY-MM-DD (UTC)
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, kind, day)
);

-- Append-only record of everything that changes access.
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT    NOT NULL DEFAULT (datetime('now')),
  event   TEXT    NOT NULL,
  subject TEXT,
  detail  TEXT
);
