// ══════════════════════════════════════════
// PURCHASE-LINKS.JS — single source of truth for where every "Buy" button
// points: the in-app purchase buttons (license.js, app.js home cards) AND
// the standalone sales page (buy.html). One file to edit so the surfaces can
// never drift.
//
// Plain runtime config — not part of the encryption build step, so links can
// change anytime without re-running scripts/encrypt-modules.js.
//
// While a link is null, its Buy buttons fall back to "contact the seller"
// (in the app) or a prefilled email (buy.html), so nothing is ever a dead end.
// ══════════════════════════════════════════
const PURCHASE_LINKS = {
  // true once in-app Razorpay checkout is live (backend RAZORPAY_KEY_ID +
  // RAZORPAY_KEY_SECRET set): buy.html's Buy buttons then open the app
  // (index.html?buy=…), which runs checkout. In the app itself, checkout
  // turns on automatically from the API's /api/checkout/config.
  inApp: true,

  // Razorpay Payment Page for full access (all 16 modules).
  bundle: null,

  // ONE Razorpay Payment Page for "any single module". Every per-module Buy
  // button opens it with ?<moduleParam>=NN appended (NN = on-screen module
  // number, two digits: 02 … 17), so the buyer lands with the right module
  // already chosen. The backend reads that field back from the payment's
  // notes (backend/src/webhooks.js → normalizeModuleChoice).
  singleModule: null,

  // Must match the Razorpay custom fields' names exactly (lowercase).
  moduleParam: 'module',
  emailParam: 'email',

  // Optional: a dedicated checkout per module, keyed by on-screen module
  // number (2 … 17). Overrides singleModule for that module only.
  modules: {
    // 9: 'https://rzp.io/rzp/…',
  }
};
window.PURCHASE_LINKS = PURCHASE_LINKS;

(function () {
  // Same key account.js stores the signed-in session under (same origin, so
  // buy.html sees it too). Only the email is read — never a token.
  const SESSION_KEY = 'mes_session_v1';
  // Read by account.js to re-check purchases when the buyer comes back.
  const PENDING_KEY = 'mes_pending_checkout_v1';

  function signedInEmail() {
    try { return (JSON.parse(localStorage.getItem(SESSION_KEY)) || {}).email || ''; } catch (e) { return ''; }
  }

  function withParams(base, params) {
    let url;
    try { url = new URL(base); } catch (e) { return base; }
    Object.keys(params).forEach((k) => { if (k && params[k]) url.searchParams.set(k, params[k]); });
    return url.toString();
  }

  // product: 'bundle', 'single' (module picked at checkout), or an on-screen
  // module number 2 … 17. Returns the checkout URL, or null if none is
  // configured for it yet (callers then show their fallback).
  function hrefFor(product) {
    const L = PURCHASE_LINKS;
    const email = {};
    email[L.emailParam] = signedInEmail();
    if (product === 'bundle') return L.bundle ? withParams(L.bundle, email) : null;
    if (product === 'single') return L.singleModule ? withParams(L.singleModule, email) : null;
    const n = parseInt(product, 10);
    if (!(n >= 2 && n <= 17)) return null;
    if (L.modules && L.modules[n]) return withParams(L.modules[n], email);
    if (!L.singleModule) return null;
    const params = Object.assign({}, email);
    params[L.moduleParam] = String(n).padStart(2, '0');
    return withParams(L.singleModule, params);
  }
  PURCHASE_LINKS.hrefFor = hrefFor;

  // Any element with data-checkout="bundle|single|NN": in-app checkout takes
  // the click when it's on; otherwise an <a> gets its URL rebuilt at click
  // time, so it carries whoever is signed in *now* (sign-in usually finishes
  // after the buttons were drawn). account.js may set
  // PURCHASE_LINKS.beforeCheckout(product) and return false to stop the
  // click (e.g. to offer sign-in first). Capture phase: runs before any
  // card-level handler that stops propagation.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('[data-checkout]');
    if (!a) return;
    const product = a.getAttribute('data-checkout');
    // In-app Razorpay checkout (account.js) takes the click when it's on.
    if (typeof PURCHASE_LINKS.openCheckout === 'function' && PURCHASE_LINKS.openCheckout(product)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const href = hrefFor(product);
    if (!href) return; // not configured — leave the element's own fallback alone
    if (typeof PURCHASE_LINKS.beforeCheckout === 'function' && PURCHASE_LINKS.beforeCheckout(product) === false) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    a.href = href;
    const owned = typeof PURCHASE_LINKS.ownedCount === 'function' ? PURCHASE_LINKS.ownedCount() : 0;
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ product: product, at: Date.now(), owned: owned })); } catch (err) { /* storage full / blocked */ }
  }, true);
})();
