// Sales-page logic (was inline; moved out so the CSP can forbid inline script).
// EDIT ME — what this page displays. The amount actually charged comes from
  // the checkout provider's own regional pricing; these strings just have to
  // match what you configured there.
  const PRICING = {
    module:      { usd: '$9.99',  inr: '₹249' },
    bundle:      { usd: '$99.99', inr: '₹2,499' },
    bundleAfter: { usd: '$129',   inr: '₹2,999' }
  };
  const EARLY_BIRD_SEATS = 100;
  const PAID_MODULES = 16;

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = text; });
  }
  function toNumber(price) { return parseFloat(price.replace(/[^0-9.]/g, '')); }

  setText('[data-module-price]', PRICING.module.usd);
  setText('[data-bundle-price]', PRICING.bundle.usd);
  setText('[data-bundle-after]', PRICING.bundleAfter.usd);
  setText('[data-module-price-inr]', PRICING.module.inr + ' in India');
  setText('[data-bundle-price-inr]', PRICING.bundle.inr + ' in India');
  setText('[data-seats]', EARLY_BIRD_SEATS);

  const sum = toNumber(PRICING.module.usd) * PAID_MODULES;
  setText('[data-sum-price]', '$' + sum.toFixed(2));
  setText('[data-savings]', Math.round((1 - toNumber(PRICING.bundle.usd) / sum) * 100) + '%');

  // One price badge per paid module card, rendered from the constant above so
  // the number lives in exactly one place instead of sixteen.
  document.querySelectorAll('.module-card:not(.free)').forEach(function (card) {
    const badge = document.createElement('div');
    badge.className = 'module-price';
    badge.textContent = PRICING.module.usd + ' · ' + PRICING.module.inr + ' individually';
    card.appendChild(badge);
  });

// Until a real checkout link exists in assets/purchase-links.js, Buy opens
  // a prefilled email, and copy that promises automatic checkout swaps to its
  // data-manual-text so the page never claims something that isn't live yet.
  var checkoutLive = !!(window.PURCHASE_LINKS && window.PURCHASE_LINKS.bundle);
  var mail = 'mailto:primeatnit@gmail.com?subject=';
  var bundleHref = checkoutLive ? window.PURCHASE_LINKS.bundle :
    mail + 'MES%20Architect%20%E2%80%94%20Full%20access&body=I%27d%20like%20full%20access%20to%20all%2016%20modules.%20How%20do%20I%20pay%3F';
  var singleHref = (window.PURCHASE_LINKS && window.PURCHASE_LINKS.singleModule) ||
    mail +'MES%20Architect%20%E2%80%94%20Single%20module&body=I%27d%20like%20to%20buy%20this%20module%3A%20%0A%0AHow%20do%20I%20pay%3F';
  document.querySelectorAll('[data-buy-link]').forEach(function (el) { el.href = bundleHref; });
  document.querySelectorAll('[data-buy-single]').forEach(function (el) { el.href = singleHref; });
  if (!checkoutLive) {
    document.querySelectorAll('[data-manual-text]').forEach(function (el) { el.textContent = el.getAttribute('data-manual-text'); });
  }
