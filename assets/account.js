// ══════════════════════════════════════════
// ACCOUNT.JS — buyer accounts against the backend (backend/ in this repo).
// Email + password via Firebase Auth's REST API (no SDK, so nothing extra
// to vendor and nothing the strict CSP has to allow besides two Google
// endpoints). Purchases are granted server-side from the payment webhook;
// this file signs in, asks the API what the account owns, and reveals those
// modules through license.js's normal path (so they cache for offline use).
//
// Dormant unless window.MES_BACKEND.apiBase and firebaseApiKey are set.
// ══════════════════════════════════════════
(function () {
  const cfg = window.MES_BACKEND || {};
  if (!cfg.apiBase || !cfg.firebaseApiKey) return;

  const AUTH = (cfg.authBase || 'https://identitytoolkit.googleapis.com/v1') + '/accounts:';
  const TOKEN = (cfg.tokenBase || 'https://securetoken.googleapis.com/v1') + '/token';
  const SESSION_KEY = 'mes_session_v1';
  const SERVER_UNLOCKED_KEY = 'mes_server_unlocked_v1';
  // Written by purchase-links.js when a Buy button is clicked: { product, at, owned }.
  const PENDING_KEY = 'mes_pending_checkout_v1';
  const PENDING_WINDOW_MS = 2 * 60 * 60 * 1000; // stop watching for it after 2h
  // The webhook usually lands within seconds of payment, occasionally later.
  const PURCHASE_RETRY_DELAYS_MS = [0, 3000, 5000, 8000, 12000, 20000, 30000];
  const QUIET_RESYNC_MS = 5 * 60 * 1000;
  const PURCHASE_SECTIONS_ALL = Array.from({ length: 16 }, (_, i) => i + 1);
  // Device id sent as X-Device-Id so the API can hold an account to its
  // device limit (backend/src/devices.js). In the Android app it's derived
  // from Android ID (@capacitor/device getId): fixed per phone + app signing
  // key, so reinstalling or clearing app data doesn't make a "new" device; it
  // changes only on factory reset. Browsers have nothing like it, so the
  // website keeps a random id in storage. Either way it survives sign-outs.
  const DEVICE_KEY = 'mes_device_v1';

  let idToken = null;
  let idTokenExp = 0;
  let owned = [];
  let lastState = {};
  let lastSyncAt = 0;
  let syncInFlight = null;
  let watchingPurchase = false;
  let deviceInfo = null;              // /api/me's "device" block, when the account owns something
  const open = { claim: false, devices: false }; // which account sub-panels are expanded
  const translationCache = new Map();

  const FRIENDLY = {
    EMAIL_EXISTS: 'An account with that email already exists — sign in instead.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    INVALID_PASSWORD: 'Wrong email or password.',
    EMAIL_NOT_FOUND: 'Wrong email or password.',
    INVALID_EMAIL: 'That email address looks invalid.',
    USER_DISABLED: 'This account has been disabled.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts — wait a few minutes and try again.',
    WEAK_PASSWORD: 'Password must be at least 6 characters.',
    MISSING_PASSWORD: 'Enter a password.',
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'For safety, sign out and back in, then delete the account.',
    TOKEN_EXPIRED: 'For safety, sign out and back in, then delete the account.'
  };

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { return null; }
  }
  function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }

  function claims(token) {
    try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; }
  }

  function acceptTokens(id, refresh, expiresIn) {
    idToken = id;
    idTokenExp = Date.now() + (parseInt(expiresIn, 10) || 3600) * 1000;
    const c = claims(id);
    saveSession({ refreshToken: refresh, email: c.email || '' });
  }

  async function authPost(method, body) {
    const res = await fetch(AUTH + method + '?key=' + encodeURIComponent(cfg.firebaseApiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = String((data.error && data.error.message) || 'UNKNOWN').split(' ')[0];
      throw new Error(FRIENDLY[code] || 'Sign-in failed (' + code + ').');
    }
    return data;
  }

  async function refreshToken() {
    const s = loadSession();
    if (!s || !s.refreshToken) return null;
    const res = await fetch(TOKEN + '?key=' + encodeURIComponent(cfg.firebaseApiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken)
    });
    if (!res.ok) { if (res.status === 400) signOut(true); return null; }
    const data = await res.json();
    acceptTokens(data.id_token, data.refresh_token, data.expires_in);
    return idToken;
  }

  async function getIdToken(force) {
    if (!force && idToken && Date.now() < idTokenExp - 60000) return idToken;
    return refreshToken();
  }

  function isNativeApp() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  }

  function storedDeviceId() {
    try {
      const id = localStorage.getItem(DEVICE_KEY) || '';
      return /^[A-Za-z0-9_-]{16,64}$/.test(id) ? id : '';
    } catch (e) { return ''; }
  }

  function randomDeviceId() {
    let id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch (e) { /* storage blocked */ }
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* storage blocked */ }
    }
    return id;
  }

  // Android ID, hashed with an app-specific prefix so the raw value never
  // leaves the phone. Null on the web, or in an app build without the plugin.
  let androidIdPromise = null;
  function androidDeviceId() {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    const device = plugins && plugins.Device;
    if (!isNativeApp() || !device || typeof device.getId !== 'function') return Promise.resolve(null);
    if (!androidIdPromise) {
      androidIdPromise = device.getId().then(async (r) => {
        const raw = r && r.identifier;
        if (!raw) return null;
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mes-architect-device:' + raw));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }).catch(() => null);
    }
    return androidIdPromise;
  }

  async function deviceHeaders() {
    const androidId = await androidDeviceId();
    if (!androidId) return { 'X-Device-Id': randomDeviceId(), 'X-Device-Label': deviceLabel() };
    const headers = { 'X-Device-Id': androidId, 'X-Device-Label': deviceLabel() };
    // An install that registered with its old random id hands that slot over
    // to the Android ID instead of taking a second one.
    const previous = storedDeviceId();
    if (previous) headers['X-Device-Previous'] = previous;
    return headers;
  }

  // What the owner sees in their device list ("Chrome on Windows").
  function deviceLabel() {
    const ua = navigator.userAgent || '';
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS'
      : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'unknown system';
    if (isNativeApp()) return 'MES Architect app on ' + os;
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return browser + ' on ' + os;
  }

  async function api(path, init) {
    const token = await getIdToken(false);
    if (!token) throw new Error('sign-in-required');
    const res = await fetch(cfg.apiBase + path, {
      ...(init || {}),
      headers: {
        ...((init && init.headers) || {}),
        ...(await deviceHeaders()),
        'Authorization': 'Bearer ' + token
      }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || ('http-' + res.status));
      err.data = data;
      throw err;
    }
    return res;
  }

  function serverUnlocked() {
    try { return JSON.parse(localStorage.getItem(SERVER_UNLOCKED_KEY)) || []; } catch (e) { return []; }
  }

  // Ask the API what this account owns and reveal anything not yet shown.
  async function sync() {
    const me = await (await api('/api/me')).json();
    owned = me.sections || [];
    deviceInfo = me.device || null;
    // The server has moved any old random-id slot to the Android ID by now.
    if (deviceInfo && (await androidDeviceId()) && storedDeviceId()) localStorage.removeItem(DEVICE_KEY);
    if (deviceInfo && !deviceInfo.allowed) {
      // Over the device limit (this device was removed, or never had a
      // slot): take back anything the account unlocked here earlier.
      const previous = serverUnlocked();
      if (previous.length) {
        if (window.forgetUnlockedModules) window.forgetUnlockedModules(previous);
        localStorage.removeItem(SERVER_UNLOCKED_KEY);
        location.reload();
      }
      lastSyncAt = Date.now();
      return me;
    }
    const unlocked = new Set(serverUnlocked());
    for (const section of owned) {
      const gate = document.querySelector('.locked-gate[data-module="' + section + '"]');
      if (!gate || gate.classList.contains('unlocked')) {
        // Restored from the offline cache before we knew it was owned — its
        // translate controls were drawn as locked; re-check them now.
        if (window.refreshTranslateLockUI) window.refreshTranslateLockUI(String(section));
        unlocked.add(section);
        continue;
      }
      const mod = await (await api('/api/modules/' + section)).json();
      if (window.revealModuleFromServer) window.revealModuleFromServer(section, mod.html);
      unlocked.add(section);
    }
    localStorage.setItem(SERVER_UNLOCKED_KEY, JSON.stringify([...unlocked]));
    if (window.refreshHomeIfActive) window.refreshHomeIfActive();
    lastSyncAt = Date.now();
    return me;
  }

  // Overlapping triggers (sign-in, tab focus, retry loop, Restore button)
  // share one request instead of racing each other.
  function syncOnce() {
    if (!syncInFlight) syncInFlight = sync().finally(() => { syncInFlight = null; });
    return syncInFlight;
  }

  // ── After checkout: keep checking until the purchase shows up ──
  function pendingCheckout() {
    let p;
    try { p = JSON.parse(localStorage.getItem(PENDING_KEY)); } catch (e) { p = null; }
    if (!p || !p.at || Date.now() - p.at > PENDING_WINDOW_MS) { localStorage.removeItem(PENDING_KEY); return null; }
    return p;
  }
  function clearPending() { localStorage.removeItem(PENDING_KEY); }

  function purchaseLanded(p, sections) {
    if (p.product === 'bundle') return sections.length >= 16;
    const n = parseInt(p.product, 10);
    if (n >= 2 && n <= 17) return sections.includes(n - 1);
    return sections.length > (p.owned || 0); // 'single' or unknown: anything new
  }

  function moduleLabel(section) {
    // sectionTitles already lead with the number ("09 — Cloud Migration").
    const title = typeof sectionTitles !== 'undefined' && String(sectionTitles[section] || '').replace(/^\d+\s*[—–-]\s*/, '');
    return 'Module ' + String(section + 1).padStart(2, '0') + (title ? ' · ' + title : '');
  }
  function unlockedMessage(added) {
    if (added.length >= 16) return '🔓 Full access unlocked — all 16 modules are yours.';
    if (added.length === 1) return '🔓 Unlocked ' + moduleLabel(added[0]) + '.';
    return '🔓 Unlocked ' + added.length + ' modules.';
  }

  function isVerified() { return !!(lastState.email && lastState.verified); }
  function deviceBlocked() { return !!(deviceInfo && !deviceInfo.allowed); }

  async function watchForPurchase(p) {
    if (watchingPurchase || !isVerified()) return;
    watchingPurchase = true;
    const before = new Set(owned);
    const email = lastState.email;
    render({ email, verified: true, sections: owned.length, message: 'Payment received? Unlocking your purchase…' });
    try {
      for (const delay of PURCHASE_RETRY_DELAYS_MS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        let me;
        try { me = await syncOnce(); } catch (e) { if (e.message === 'sign-in-required') return; continue; }
        if (deviceBlocked()) { clearPending(); render({ email, verified: true, sections: 0 }); return; }
        if (purchaseLanded(p, me.sections)) {
          clearPending();
          // Usually already revealed by the sync that ran on sign-in, so
          // describe what was bought rather than what changed just now.
          const n = parseInt(p.product, 10);
          const bought = p.product === 'bundle' ? PURCHASE_SECTIONS_ALL
            : (n >= 2 && n <= 17 ? [n - 1] : me.sections.filter((s) => !before.has(s)));
          render({ email, verified: true, sections: me.sections.length, good: true,
            message: bought.length ? unlockedMessage(bought) : 'Your purchase is unlocked — ' + me.sections.length + ' of 16 modules on this account.' });
          return;
        }
      }
      render({ email, verified: true, sections: owned.length,
        message: 'Not showing yet — payments can take a minute. Tap “Restore purchases” shortly. ' +
          'Paid with a different email than ' + email + '? Tap “Paid with another email?” below.' });
    } finally {
      watchingPurchase = false;
    }
  }

  function openAccountPanel(message) {
    // Phones: "sidebar-toggled" means open. Desktop: it means collapsed.
    if (window.innerWidth <= 900) document.body.classList.add('sidebar-toggled');
    else document.body.classList.remove('sidebar-toggled');
    render({ message });
    const box = document.getElementById('accountBox');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' });
    const input = document.getElementById('accountEmail');
    if (input) input.focus();
  }

  // Called by purchase-links.js on every Buy click. Signed out, the buyer is
  // offered sign-in first, so checkout opens with their account email
  // already filled in and the purchase lands on the account they'll use.
  if (window.PURCHASE_LINKS) {
    window.PURCHASE_LINKS.ownedCount = () => owned.length;
    window.PURCHASE_LINKS.beforeCheckout = function () {
      if (lastState.email) return true;
      const signInFirst = window.confirm(
        'Sign in before you pay?\n\n' +
        'Purchases unlock on the account with the same email you pay with. ' +
        'Sign in (or create a free account) first and checkout fills that email in for you.\n\n' +
        'OK — sign in first\nCancel — go to checkout anyway');
      if (!signInFirst) return true;
      openAccountPanel('Sign in or create an account, then tap Buy again.');
      return false;
    };
  }

  function signOut(silent) {
    const hadContent = serverUnlocked().length > 0;
    localStorage.removeItem(SESSION_KEY);
    idToken = null; idTokenExp = 0; owned = [];
    // A shared device shouldn't keep showing the previous account's modules.
    if (hadContent && window.forgetUnlockedModules) window.forgetUnlockedModules(serverUnlocked());
    localStorage.removeItem(SERVER_UNLOCKED_KEY);
    if (!silent) location.reload();
  }

  // ── In-app checkout (Razorpay Standard Checkout, backend/src/checkout.js) ──
  // Buy opens a summary sheet with the server's price for this buyer (full
  // price, the running offer, and a promo code if they have one). Pay opens
  // Razorpay's window for exactly that total. The server works the price
  // out again when it makes the order, so nothing in the app can lower it.
  // On success the server verifies the signature and grants straight away;
  // if the app closes first, the order.paid webhook grants it and the
  // re-check loop picks it up. A 100% code grants with no payment at all.
  const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
  const RESUME_BUY_KEY = 'mes_resume_buy_v1';
  const CHECKOUT_ERRORS = {
    already_owned: 'You already own that. Tap “Restore purchases” if it isn’t showing.',
    email_not_verified: 'Verify your email first (check your inbox), then tap “I’ve verified”.',
    checkout_limit: 'Too many checkout attempts today. Please try again tomorrow.',
    checkout_not_configured: 'Checkout isn’t available right now. Use Send Feedback and I’ll sort it out.',
    checkout_unavailable: 'The payment service didn’t answer. Please try again in a minute.',
    promo_invalid: 'That code isn’t valid. Check the spelling and try again.',
    promo_expired: 'That code has expired.',
    promo_not_applicable: 'That code doesn’t apply to this purchase.',
    promo_already_used: 'You’ve already used that code.',
    promo_used_up: 'That code has been fully used.',
    promo_limit: 'Too many codes tried today. Please try again tomorrow.'
  };
  const pricing = window.MES_PRICING || null;
  let checkoutOpen = false; // Razorpay's window is up
  let sheet = null;         // { el, product, quote, code, busy }

  function checkoutEnabled() { return !!(pricing && pricing.get().enabled); }

  function loadCheckoutScript() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = CHECKOUT_SCRIPT;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error('checkout-script')); };
      document.head.appendChild(s);
    });
  }

  function productCode(product) {
    if (product === 'bundle') return 'bundle';
    const n = parseInt(product, 10);
    return n >= 2 && n <= 17 ? String(n).padStart(2, '0') : null;
  }
  function productName(code) {
    return code === 'bundle' ? 'Full access · all 16 modules' : moduleLabel(parseInt(code, 10) - 1);
  }

  function say(message, good) {
    render(Object.assign({}, lastState, { message, good: !!good }));
  }

  async function startCheckout(product) {
    const code = productCode(product);
    if (!code || checkoutOpen || (sheet && !sheet.el.hidden)) return;
    if (!lastState.email || !lastState.verified) {
      try { sessionStorage.setItem(RESUME_BUY_KEY, String(product)); } catch (e) { /* private mode */ }
      openAccountPanel(!lastState.email
        ? 'Sign in or create a free account first. Your purchase is saved to it, on up to 2 devices, and checkout opens right after.'
        : 'Verify your email first (check your inbox), then tap “I’ve verified”. Checkout opens right after.');
      return;
    }
    let config = pricing ? pricing.get() : null;
    if (pricing && (!config.enabled || config.fallback)) config = await pricing.load();
    if (!config || !config.enabled) { say(CHECKOUT_ERRORS.checkout_not_configured); return; }
    openSheet(code, config);
  }

  // ── The summary sheet ──
  function buildSheet() {
    const el = document.createElement('div');
    el.id = 'checkoutSheet';
    el.className = 'checkout-sheet';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'checkoutTitle');
    el.innerHTML =
      '<div class="checkout-card">' +
        '<div class="checkout-head">' +
          '<h2 id="checkoutTitle">Checkout</h2>' +
          '<button type="button" class="checkout-close" aria-label="Close checkout">✕</button>' +
        '</div>' +
        '<p class="checkout-item"></p>' +
        '<div class="checkout-lines"></div>' +
        '<div class="checkout-promo">' +
          '<button type="button" class="checkout-promo-toggle" aria-expanded="false" aria-controls="checkoutPromoForm">Have a promo code?</button>' +
          '<form class="checkout-promo-form" id="checkoutPromoForm" hidden>' +
            '<input type="text" class="checkout-promo-input" aria-label="Promo code" placeholder="Promo code" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
            '<button type="submit" class="checkout-promo-apply">Apply</button>' +
          '</form>' +
          '<p class="checkout-msg" role="status" aria-live="polite"></p>' +
        '</div>' +
        '<button type="button" class="checkout-pay">Pay</button>' +
        '<p class="checkout-foot">One-time payment, secured by Razorpay. Not for you? Full refund within 7 days.</p>' +
      '</div>';
    el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); });
    el.querySelector('.checkout-close').addEventListener('click', closeSheet);
    el.querySelector('.checkout-promo-toggle').addEventListener('click', () => showPromoForm(true));
    el.querySelector('.checkout-promo-form').addEventListener('submit', (e) => {
      e.preventDefault();
      applyPromo(el.querySelector('.checkout-promo-input').value);
    });
    el.querySelector('.checkout-pay').addEventListener('click', pay);
    document.body.appendChild(el);
    return el;
  }

  function showPromoForm(focus) {
    const el = sheet.el;
    el.querySelector('.checkout-promo-toggle').hidden = true;
    el.querySelector('.checkout-promo-toggle').setAttribute('aria-expanded', 'true');
    el.querySelector('.checkout-promo-form').hidden = false;
    if (focus) el.querySelector('.checkout-promo-input').focus();
  }

  function sheetMessage(text, good) {
    const m = sheet.el.querySelector('.checkout-msg');
    m.textContent = text || '';
    m.classList.toggle('good', !!good);
  }

  function line(label, value, cls) {
    const row = document.createElement('div');
    row.className = 'checkout-line' + (cls ? ' ' + cls : '');
    const a = document.createElement('span');
    a.textContent = label;
    const b = document.createElement('span');
    b.textContent = value;
    row.append(a, b);
    return row;
  }

  function renderSheet() {
    const { el, quote: q } = sheet;
    const money = (n) => pricing.format(n, q.currency);
    el.querySelector('.checkout-item').textContent = productName(sheet.product);
    const lines = el.querySelector('.checkout-lines');
    lines.textContent = '';
    if (q.list > q.price) {
      lines.append(line('Full price', money(q.list), 'was'));
      lines.append(line((q.offer ? q.offer.label : 'Offer') + ' · ' + q.percentOff + '% off', '− ' + money(q.list - q.price), 'off'));
    }
    if (q.promo) {
      const row = line('Code ' + q.promo.code + (q.promo.label && q.promo.label !== q.promo.code ? ' · ' + q.promo.label : ''), '− ' + money(q.promo.discount), 'off');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'checkout-promo-remove';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove code ' + q.promo.code);
      remove.addEventListener('click', () => { sheetMessage(''); requote(''); });
      row.firstChild.append(' ', remove);
      lines.append(row);
    }
    lines.append(line('Total', money(q.total), 'total'));
    const payBtn = el.querySelector('.checkout-pay');
    payBtn.textContent = sheet.busy ? 'Opening secure checkout…' : (q.total === 0 ? 'Unlock for free' : 'Pay ' + money(q.total));
    payBtn.disabled = !!sheet.busy;
    el.querySelector('.checkout-promo-apply').disabled = !!sheet.busy;
  }

  function quoteFromSheet(config, kind) {
    const p = config.prices[kind];
    return { currency: config.currency, list: p.list, price: p.price, percentOff: p.percentOff, offer: p.offer, promo: null, total: p.price };
  }

  function openSheet(code, config) {
    const el = (sheet && sheet.el) || buildSheet();
    sheet = { el, product: code, code: '', busy: false, quote: quoteFromSheet(config, code === 'bundle' ? 'bundle' : 'module') };
    el.querySelector('.checkout-promo-input').value = '';
    el.querySelector('.checkout-promo-form').hidden = true;
    el.querySelector('.checkout-promo-toggle').hidden = false;
    el.querySelector('.checkout-promo-toggle').setAttribute('aria-expanded', 'false');
    sheetMessage('');
    renderSheet();
    el.hidden = false;
    document.body.classList.add('checkout-open');
    el.querySelector('.checkout-pay').focus();
    requote(''); // confirm the price with the server (it may have changed)
  }

  function closeSheet() {
    if (!sheet || sheet.el.hidden) return;
    sheet.el.hidden = true;
    document.body.classList.remove('checkout-open');
  }
  window.closeCheckoutSheet = closeSheet;

  async function fetchQuote(code) {
    const res = await api('/api/checkout/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: sheet.product, promo: code || undefined })
    });
    return res.json();
  }

  async function requote(code) {
    const s = sheet;
    try {
      const q = await fetchQuote(code);
      if (s !== sheet) return;
      s.quote = q;
      s.code = q.promo ? q.promo.code : '';
      renderSheet();
    } catch (e) {
      if (s === sheet && code) sheetMessage(CHECKOUT_ERRORS[e.message] || 'Couldn’t check that code. Check your connection and try again.');
    }
  }

  async function applyPromo(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) { sheetMessage('Type your promo code first.'); return; }
    sheetMessage('Checking code…');
    const s = sheet;
    try {
      const q = await fetchQuote(code);
      if (s !== sheet) return;
      s.quote = q;
      s.code = q.promo.code;
      renderSheet();
      sheetMessage(q.total === 0 ? 'Code applied: this one’s free.' : 'Code applied: you save ' + pricing.format(q.promo.discount, q.currency) + '.', true);
    } catch (e) {
      if (s === sheet) sheetMessage(CHECKOUT_ERRORS[e.message] || 'Couldn’t check that code. Check your connection and try again.');
    }
  }

  async function pay() {
    const s = sheet;
    if (!s || s.busy) return;
    s.busy = true;
    sheetMessage('');
    renderSheet();
    const product = String(parseInt(s.product, 10) || s.product);
    let order;
    try {
      const orderReq = api('/api/checkout/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: s.product, promo: s.code || undefined })
      }).then((r) => r.json());
      const [o] = await Promise.all([orderReq, s.quote.total > 0 ? loadCheckoutScript() : null]);
      order = o;
    } catch (e) {
      s.busy = false;
      renderSheet();
      if (e.message === 'sign-in-required') { closeSheet(); return; }
      if (/^promo_/.test(e.message)) requote('');
      sheetMessage(CHECKOUT_ERRORS[e.message] || 'Couldn’t open checkout. Check your connection and try again.');
      return;
    }
    s.busy = false;
    closeSheet();
    const remember = () => {
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ product, at: Date.now(), owned: owned.length })); } catch (e) { /* storage full */ }
      return pendingCheckout();
    };

    if (order.free) {
      const p = remember();
      if (p) watchForPurchase(p);
      return;
    }

    const q = order.quote || s.quote;
    const extras = [];
    if (q.offer && q.percentOff) extras.push(q.offer.label + ' ' + q.percentOff + '% off');
    if (q.promo) extras.push('code ' + q.promo.code);
    checkoutOpen = true;
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: 'MES Architect',
      description: (productName(s.product) + (extras.length ? ' · ' + extras.join(' · ') : '')).slice(0, 250),
      prefill: { email: order.email },
      readonly: { email: true },
      notes: { app: 'mes-architect' }, // tells the webhook this is an in-app order
      theme: { color: '#f59e0b' },
      modal: { ondismiss: () => { checkoutOpen = false; say(''); } },
      handler: (resp) => { checkoutOpen = false; finishCheckout(order, resp, remember); }
    });
    rzp.on('payment.failed', (r) => {
      const why = r && r.error && r.error.description;
      say('Payment didn’t go through' + (why ? ': ' + why : '') + '. Try again or pick another method.');
    });
    rzp.open();
  }

  async function finishCheckout(order, resp, remember) {
    remember();
    say('Payment received. Unlocking…', true);
    try {
      await api('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
      });
    } catch (e) { /* the webhook still grants it; the loop below picks it up */ }
    const p = pendingCheckout();
    if (p) watchForPurchase(p);
  }

  function resumeCheckout() {
    let product = null;
    try { product = sessionStorage.getItem(RESUME_BUY_KEY); sessionStorage.removeItem(RESUME_BUY_KEY); } catch (e) { /* private mode */ }
    if (product && isVerified()) startCheckout(product);
    else if (product) { try { sessionStorage.setItem(RESUME_BUY_KEY, product); } catch (e) { /* ignore */ } }
  }

  if (window.PURCHASE_LINKS) {
    // Called by purchase-links.js on every Buy click; true = handled here.
    window.PURCHASE_LINKS.openCheckout = function (product) {
      if (!checkoutEnabled() || !productCode(product)) return false;
      startCheckout(product);
      return true;
    };
  }

  // ── Public surface used by app.js (AI chat) and translate.js ──
  window.MESAccount = {
    ownsSection: (n) => owned.includes(Number(n)),
    async chat(messages, level) {
      return api('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, level })
      });
    },
    async translation(section, lang) {
      const k = section + ':' + lang;
      if (!translationCache.has(k)) {
        translationCache.set(k, api('/api/modules/' + section + '/translations/' + lang)
          .then((r) => r.json()).then((d) => d.blocks)
          .catch((e) => { translationCache.delete(k); throw e; }));
      }
      return translationCache.get(k);
    }
  };

  // ── Sidebar UI ──
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else n.setAttribute(k, v); });
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }

  function render(state) {
    const footer = document.getElementById('sidebarFooter');
    if (!footer) return;
    let box = document.getElementById('accountBox');
    if (!box) {
      box = el('div', { id: 'accountBox' });
      const licenseRow = document.getElementById('globalLicenseRow');
      footer.insertBefore(box, licenseRow || null);
    }
    lastState = state;
    // Locked modules show "Already bought it? Sign in" only to signed-out visitors.
    document.body.classList.toggle('mes-signed-in', !!state.email);
    box.replaceChildren();
    box.appendChild(el('div', { class: 'global-license-label', text: '👤 Your account' }));
    const status = el('div', { class: 'global-license-status' + (state.good ? ' account-good' : ''), id: 'accountStatus', text: state.message || '' });

    if (!state.email) {
      const email = el('input', { type: 'email', id: 'accountEmail', placeholder: 'Email', 'aria-label': 'Email', autocomplete: 'email' });
      const pass = el('input', { type: 'password', id: 'accountPassword', placeholder: 'Password', 'aria-label': 'Password', autocomplete: 'current-password' });
      const signIn = el('button', { type: 'button', text: 'Sign in' });
      const create = el('button', { type: 'button', class: 'account-secondary', text: 'Create account' });
      const forgot = el('button', { type: 'button', class: 'account-link', text: 'Forgot password?' });
      const run = (fn) => async () => {
        status.textContent = '…';
        try { await fn(); } catch (e) { status.textContent = e.message; }
      };
      signIn.addEventListener('click', run(async () => {
        const d = await authPost('signInWithPassword', { email: email.value.trim(), password: pass.value, returnSecureToken: true });
        acceptTokens(d.idToken, d.refreshToken, d.expiresIn);
        await afterSignIn();
      }));
      create.addEventListener('click', run(async () => {
        const d = await authPost('signUp', { email: email.value.trim(), password: pass.value, returnSecureToken: true });
        acceptTokens(d.idToken, d.refreshToken, d.expiresIn);
        await authPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: d.idToken });
        await afterSignIn();
      }));
      forgot.addEventListener('click', run(async () => {
        await authPost('sendOobCode', { requestType: 'PASSWORD_RESET', email: email.value.trim() });
        status.textContent = 'If that address has an account, a reset link is on its way.';
      }));
      [email, pass].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn.click(); }));
      box.append(
        el('div', { class: 'account-fields' }, [email, pass]),
        el('div', { class: 'global-license-input-row account-actions' }, [signIn, create]),
        forgot,
        el('div', { class: 'global-license-hint', text: 'Use the email you paid with — your modules unlock automatically, on any device.' }),
        status
      );
      return;
    }

    box.appendChild(el('div', { class: 'account-email', text: state.email }));
    if (!state.verified) {
      const resend = el('button', { type: 'button', class: 'account-secondary', text: 'Resend email' });
      const check = el('button', { type: 'button', text: "I've verified" });
      resend.addEventListener('click', async () => {
        try { await authPost('sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: await getIdToken(true) }); status.textContent = 'Verification email sent.'; }
        catch (e) { status.textContent = e.message; }
      });
      check.addEventListener('click', () => afterSignIn(true));
      box.append(
        el('div', { class: 'global-license-hint', text: 'Verify your email to unlock purchases — check your inbox for the link.' }),
        el('div', { class: 'global-license-input-row account-actions' }, [check, resend])
      );
    } else {
      renderOwnedAccount(box, state, status);
    }
    const out = el('button', { type: 'button', class: 'account-link', text: 'Sign out' });
    out.addEventListener('click', () => signOut(false));
    const del = el('button', { type: 'button', class: 'account-link account-danger', text: 'Delete account' });
    del.addEventListener('click', async () => {
      if (!window.confirm('Delete your account? Your sign-in and usage history are erased and this device is signed out. ' +
        'Purchase records are kept for tax and refund purposes; buying again with the same email restores access.')) return;
      status.textContent = 'Deleting…';
      try { await deleteAccount(); }
      catch (e) { status.textContent = e.message === 'sign-in-required' ? FRIENDLY.TOKEN_EXPIRED : e.message; }
    });
    box.append(out, del, status);
  }

  // ── Verified account: purchases, claim, devices ──
  const CLAIM_ERRORS = {
    claim_not_found: 'No unclaimed purchase matches that email and reference. Check both against your receipt.',
    same_email: 'That’s already this account’s email — tap “Restore purchases” instead.',
    claim_limit: 'Too many attempts today. Try again tomorrow, or use Send Feedback.',
    bad_claim: 'Enter the email and the payment ID or order number exactly as they appear on your receipt.'
  };

  function shortDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(iso) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 48 * 60) return Math.round(mins / 60) + ' h ago';
    return Math.round(mins / 1440) + ' days ago';
  }

  async function refreshAfter(state, message, good) {
    try {
      const me = await syncOnce();
      render({ email: state.email, verified: true, sections: me.sections.length, good, message });
    } catch (e) {
      render({ email: state.email, verified: true, sections: owned.length, message });
    }
  }

  function deviceList(state, status) {
    const d = deviceInfo;
    const list = el('div', { class: 'account-devices' });
    const cooling = !!d.nextRemovalAt;
    d.devices.forEach((dev) => {
      const row = el('div', { class: 'account-device' }, [
        el('span', { class: 'account-device-name', text: dev.label + (dev.current ? ' (this device)' : '') }),
        el('span', { class: 'account-device-seen', text: 'last used ' + ago(dev.lastSeen) })
      ]);
      // Removing the current device would just re-add it on the next check.
      if (!dev.current) {
        const remove = el('button', { type: 'button', class: 'account-link account-danger', text: deviceBlocked() ? 'Remove & use this device' : 'Remove' });
        if (cooling) remove.setAttribute('disabled', '');
        remove.addEventListener('click', async () => {
          if (!window.confirm('Remove “' + dev.label + '”?\n\nIt loses access to your modules until it gets a free slot again. ' +
            'You can remove one device every ' + d.swapDays + ' days.')) return;
          status.className = 'global-license-status';
          status.textContent = 'Removing…';
          try {
            const wasBlocked = deviceBlocked();
            await api('/api/devices/' + encodeURIComponent(dev.id), { method: 'DELETE' });
            open.devices = false;
            await refreshAfter(state, wasBlocked ? '🔓 Removed “' + dev.label + '” — this device is unlocked now.' : 'Removed “' + dev.label + '”.', true);
          } catch (e) {
            status.textContent = e.message === 'device_swap_cooldown' && e.data && e.data.retryAt
              ? 'You removed a device recently — you can swap again on ' + shortDate(e.data.retryAt) + '.'
              : (e.message === 'sign-in-required' ? '' : 'Couldn’t remove it — try again in a moment.');
          }
        });
        row.appendChild(remove);
      }
      list.appendChild(row);
    });
    if (cooling) {
      list.appendChild(el('div', { class: 'global-license-hint', text: 'You removed a device recently. Next swap: ' + shortDate(d.nextRemovalAt) + '. Stuck before then? Use Send Feedback.' }));
    }
    return list;
  }

  function claimForm(state, status) {
    const email = el('input', { type: 'email', placeholder: 'Email you paid with', 'aria-label': 'Email you paid with', autocomplete: 'off' });
    const ref = el('input', { type: 'text', placeholder: 'Payment ID or order no.', 'aria-label': 'Payment ID or order number', autocomplete: 'off', spellcheck: 'false' });
    const go = el('button', { type: 'button', text: 'Move to this account' });
    go.addEventListener('click', async () => {
      const before = new Set(owned);
      status.className = 'global-license-status';
      status.textContent = 'Checking…';
      try {
        const res = await (await api('/api/purchases/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.value.trim(), ref: ref.value.trim() })
        })).json();
        open.claim = false;
        const added = (res.sections || []).filter((s) => !before.has(s));
        await refreshAfter(state, added.length ? unlockedMessage(added) : 'Moved to ' + state.email + '.', true);
      } catch (e) {
        status.textContent = CLAIM_ERRORS[e.message] || (e.message === 'sign-in-required' ? '' : 'Couldn’t reach the server — try again in a moment.');
      }
    });
    [email, ref].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); }));
    return el('div', { class: 'account-subpanel' }, [
      el('div', { class: 'global-license-hint', text: 'From your receipt: the email you paid with, plus the Razorpay payment ID (starts with pay_) or the order number. The purchase moves to ' + state.email + ' for good.' }),
      el('div', { class: 'account-fields' }, [email, ref]),
      el('div', { class: 'global-license-input-row account-actions' }, [go])
    ]);
  }

  function renderOwnedAccount(box, state, status) {
    if (deviceBlocked()) {
      // Signed in fine, but every device slot is taken by other devices.
      box.append(
        el('div', { class: 'global-license-hint account-warning', text: 'This account is already unlocked on ' + deviceInfo.max +
          ' other devices — the most it can be at once. Remove one to use your modules here:' }),
        deviceList(state, status)
      );
      return;
    }
    const restore = el('button', { type: 'button', class: 'account-link', text: 'Restore purchases' });
    restore.addEventListener('click', async () => {
      const before = new Set(owned);
      status.className = 'global-license-status';
      status.textContent = 'Checking your purchases…';
      try {
        const me = await syncOnce();
        const added = me.sections.filter((s) => !before.has(s));
        if (added.length) clearPending();
        if (!me.sections.length && !deviceBlocked()) open.claim = true;
        render({ email: state.email, verified: true, sections: me.sections.length, good: added.length > 0,
          message: added.length ? unlockedMessage(added)
            : (me.sections.length ? 'Up to date — nothing new on ' + state.email + '.'
              : (deviceBlocked() ? '' : 'No purchases found for ' + state.email + '. Paid with a different email? Claim it below.')) });
      } catch (e) {
        status.textContent = e.message === 'sign-in-required' ? '' : 'Couldn’t reach the server — try again in a moment.';
      }
    });
    const claimToggle = el('button', { type: 'button', class: 'account-link', 'aria-expanded': String(open.claim), text: 'Paid with another email?' });
    claimToggle.addEventListener('click', () => { open.claim = !open.claim; render(Object.assign({}, state, { message: '' })); });
    box.append(
      el('div', { class: 'global-license-hint', text: state.sections + ' of 16 modules unlocked on this account.' }),
      el('div', { class: 'account-links' }, [restore, claimToggle])
    );
    if (open.claim) box.appendChild(claimForm(state, status));
    if (deviceInfo) {
      const toggle = el('button', { type: 'button', class: 'account-link', 'aria-expanded': String(open.devices),
        text: 'Devices: ' + deviceInfo.devices.length + ' of ' + deviceInfo.max + (open.devices ? ' · hide' : ' · manage') });
      toggle.addEventListener('click', () => { open.devices = !open.devices; render(Object.assign({}, state, { message: '' })); });
      box.appendChild(el('div', {}, [toggle]));
      if (open.devices) box.appendChild(deviceList(state, status));
    }
  }

  // Server-side data first (needs a valid token), then the Firebase
  // sign-in itself, then this device's copy.
  async function deleteAccount() {
    await api('/api/account', { method: 'DELETE' });
    await authPost('delete', { idToken: await getIdToken(true) });
    signOut(false);
  }

  async function afterSignIn(forceRefresh) {
    const token = await getIdToken(!!forceRefresh);
    if (!token) { render({}); return; }
    const c = claims(token);
    if (!c.email_verified) { render({ email: c.email, verified: false }); return; }
    render({ email: c.email, verified: true, sections: owned.length, message: 'Checking your purchases…' });
    try {
      const me = await syncOnce();
      render({ email: c.email, verified: true, sections: me.sections.length });
    } catch (e) {
      render({ email: c.email, verified: true, sections: owned.length, message: e.message === 'sign-in-required' ? '' : 'Couldn’t reach the server — showing what’s already on this device.' });
      return;
    }
    const p = pendingCheckout();
    if (p) watchForPurchase(p);
    else resumeCheckout();
  }

  // Coming back to the app/tab after paying (checkout opens in a new tab on
  // the web, in the system browser from the Android app).
  function onReturn() {
    if (document.visibilityState === 'hidden' || !lastState.email) return;
    const p = pendingCheckout();
    // Ignore the focus blip right after the Buy click itself.
    if (p && isVerified()) { if (Date.now() - p.at > 5000) watchForPurchase(p); return; }
    if (isVerified() && Date.now() - lastSyncAt > QUIET_RESYNC_MS) {
      syncOnce().then((me) => render({ email: lastState.email, verified: true, sections: me.sections.length })).catch(() => {});
    }
  }

  // "👤 Sign in to unlock" on every locked module.
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('.locked-signin-btn')) return;
    openAccountPanel('Sign in with the email you paid with — your modules unlock automatically.');
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('mes-accounts');
    // The payment page's success redirect lands on ?purchased=1 (see
    // backend/README.md "Payments"). Strip it so a reload doesn't re-trigger.
    const url = new URL(location.href);
    const returnedFromCheckout = url.searchParams.has('purchased');
    // buy.html's Buy buttons hand over here as ?buy=bundle | ?buy=09.
    const buyRequest = url.searchParams.get('buy');
    if (buyRequest) {
      url.searchParams.delete('buy');
      try { sessionStorage.setItem(RESUME_BUY_KEY, buyRequest); } catch (e) { /* private mode */ }
      if (!returnedFromCheckout) history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (returnedFromCheckout) {
      url.searchParams.delete('purchased');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      if (!pendingCheckout()) {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ product: 'unknown', at: Date.now(), owned: serverUnlocked().length }));
      }
    }
    if (loadSession()) afterSignIn(false);
    else if (buyRequest) startCheckout(buyRequest);
    else if (returnedFromCheckout) openAccountPanel('Payment done? Sign in — or create an account — with the email you paid with, and your purchase unlocks here.');
    else render({});
  });
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
})();
