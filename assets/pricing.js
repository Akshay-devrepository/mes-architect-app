// ══════════════════════════════════════════
// PRICING.JS: shows prices, shared by the app (index.html) and buy.html.
//
// The numbers come from the API (/api/checkout/config, worked out from
// backend/src/pricing-config.js for the visitor's country: INR in India,
// USD elsewhere), so the page always shows what checkout will charge. The
// last answer is kept for offline use; before the first one, FALLBACK and
// the time zone give a sensible guess.
//
// Markup it fills (kind = "module" or "bundle"):
//   data-price="kind"         struck-through full price + offer price
//   data-price-now="kind"     the price you pay, as text
//   data-price-was="kind"     the full price, as text (empty with no offer)
//   data-price-badge="kind"   "50% off · Early bird" (hidden with no offer)
//   data-price-off="kind"     just "50% off" (hidden with no offer)
//   data-price-sum            16 modules bought one by one
//   data-price-savings        how much the bundle saves over that, in %
// ══════════════════════════════════════════
(function () {
  const CACHE_KEY = 'mes_prices_v1';
  const PAID_MODULES = 16;
  // Mirrors backend/src/pricing-config.js; only shown until the API answers.
  // DOLLARS matches whether that file has a USD line (Razorpay must have
  // approved international payments first).
  const DOLLARS = false;
  const EARLY_BIRD = { id: 'early-bird', label: 'Early bird', ends: null };
  const FALLBACK = {
    INR: { module: { list: 49900, price: 24900, percentOff: 50, offer: EARLY_BIRD }, bundle: { list: 499900, price: 249900, percentOff: 50, offer: EARLY_BIRD } },
    USD: { module: { list: 1999, price: 999, percentOff: 50, offer: EARLY_BIRD }, bundle: { list: 19999, price: 9999, percentOff: 50, offer: EARLY_BIRD } }
  };

  function guessCurrency() {
    if (!DOLLARS) return 'INR';
    try {
      if (/^Asia\/(Kolkata|Calcutta)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '')) return 'INR';
    } catch (e) { /* old WebView */ }
    return /-IN$/i.test(navigator.language || '') ? 'INR' : 'USD';
  }

  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY));
      return c && c.currency && c.prices && c.prices.module ? c : null;
    } catch (e) { return null; }
  }

  const guessed = guessCurrency();
  let current = readCache() || { enabled: false, currency: guessed, prices: FALLBACK[guessed], fallback: true };
  const listeners = [];

  function format(minor, currency) {
    const whole = minor % 100 === 0;
    const n = minor / 100;
    if (currency === 'INR') return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
    if (currency === 'USD') return '$' + n.toFixed(2);
    return n.toFixed(2) + ' ' + currency;
  }

  function endsText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return 'ends ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  }

  function badgeText(p) {
    if (!p.offer || !p.percentOff) return '';
    return p.percentOff + '% off · ' + p.offer.label + (p.offer.ends ? ' (' + endsText(p.offer.ends) + ')' : '');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "<s>₹499</s> ₹249" as markup. Screen readers hear "Full price ₹499,
  // now ₹249" (.price-sr is visually hidden; see enhance.css / buy.html).
  function priceHtml(p, currency) {
    const now = format(p.price, currency);
    if (!(p.list > p.price)) return '<span class="price-now">' + esc(now) + '</span>';
    const was = format(p.list, currency);
    return '<s class="price-was"><span class="price-sr">Full price </span>' + esc(was) + '</s> ' +
      '<span class="price-now"><span class="price-sr">now </span>' + esc(now) + '</span>';
  }

  function fill(root) {
    const scope = root || document;
    const c = current.currency;
    const prices = current.prices;
    const each = (attr, fn) => scope.querySelectorAll('[' + attr + ']').forEach((el) => {
      const p = prices[el.getAttribute(attr)];
      if (p) fn(el, p);
    });
    each('data-price', (el, p) => { el.innerHTML = priceHtml(p, c); });
    each('data-price-now', (el, p) => { el.textContent = format(p.price, c); });
    each('data-price-was', (el, p) => { el.textContent = p.list > p.price ? format(p.list, c) : ''; });
    each('data-price-badge', (el, p) => {
      const t = badgeText(p);
      el.textContent = t;
      el.hidden = !t;
    });
    each('data-price-off', (el, p) => {
      el.textContent = p.offer && p.percentOff ? p.percentOff + '% off' : '';
      el.hidden = !el.textContent;
    });
    const sum = prices.module.price * PAID_MODULES;
    scope.querySelectorAll('[data-price-sum]').forEach((el) => { el.textContent = format(sum, c); });
    scope.querySelectorAll('[data-price-savings]').forEach((el) => {
      el.textContent = Math.max(0, Math.round((1 - prices.bundle.price / sum) * 100)) + '%';
    });
  }

  function set(next) {
    current = next;
    fill();
    listeners.slice().forEach((fn) => { try { fn(current); } catch (e) { /* a listener's bug */ } });
  }

  let loading = null;
  function load() {
    const api = (window.MES_BACKEND || {}).apiBase;
    if (!api) return Promise.resolve(current);
    if (!loading) {
      loading = fetch(api + '/api/checkout/config', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((cfg) => {
          if (cfg && cfg.currency && cfg.prices && cfg.prices.module && cfg.prices.bundle) {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cfg)); } catch (e) { /* storage full */ }
            set(cfg);
          }
          return current;
        })
        .catch(() => { loading = null; return current; });
    }
    return loading;
  }

  window.MES_PRICING = {
    get: () => current,
    load,
    fill,
    format,
    badgeText,
    priceHtml,
    onChange: (fn) => { listeners.push(fn); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => fill());
  else fill();
  let loadedAt = Date.now();
  load();
  // Offers start and end on their own: look again when the app comes back.
  function reload() { loadedAt = Date.now(); loading = null; load(); }
  window.addEventListener('online', reload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - loadedAt > 10 * 60 * 1000) reload();
  });
})();
