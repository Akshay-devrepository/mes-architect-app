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

// Until a real checkout link exists in assets/purchase-links.js, Buy opens
  // a prefilled email, and copy that promises automatic checkout swaps to its
  // data-manual-text so the page never claims something that isn't live yet.
  // Live links carry data-checkout, so purchase-links.js rebuilds them at
  // click time with the signed-in email (and module number) filled in.
  var links = window.PURCHASE_LINKS;
  var checkoutLive = !!(links && links.bundle);
  var mail = 'mailto:primeatnit@gmail.com?subject=';
  function mailFor(subject, body) {
    return mail + encodeURIComponent('MES Architect — ' + subject) + '&body=' + encodeURIComponent(body + '\n\nHow do I pay?');
  }
  function wire(el, product, fallback) {
    var href = links && links.hrefFor ? links.hrefFor(product) : null;
    if (href) {
      el.href = href;
      el.setAttribute('data-checkout', product);
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      el.href = fallback;
    }
  }
  document.querySelectorAll('[data-buy-link]').forEach(function (el) {
    wire(el, 'bundle', mailFor('Full access', 'I’d like full access to all 16 modules.'));
  });
  document.querySelectorAll('[data-buy-single]').forEach(function (el) {
    wire(el, 'single', mailFor('Single module', 'I’d like to buy this module: '));
  });

  // Price + Buy button on each paid module card. Prices are rendered from
  // the constant above so the number lives in one place instead of sixteen.
  document.querySelectorAll('.module-card:not(.free)').forEach(function (card) {
    var numEl = card.querySelector('.num');
    var match = numEl && /(\d{1,2})/.exec(numEl.textContent);
    var n = match ? parseInt(match[1], 10) : 0;
    var title = (card.querySelector('h3') || {}).textContent || ('Module ' + n);

    var foot = document.createElement('div');
    foot.className = 'module-foot';
    var badge = document.createElement('div');
    badge.className = 'module-price';
    badge.textContent = PRICING.module.usd + ' · ' + PRICING.module.inr;
    foot.appendChild(badge);

    if (n >= 2 && n <= 17) {
      var buy = document.createElement('a');
      buy.className = 'module-buy';
      buy.textContent = 'Buy this module';
      buy.setAttribute('aria-label', 'Buy Module ' + String(n).padStart(2, '0') + ' — ' + title);
      wire(buy, String(n), mailFor('Module ' + String(n).padStart(2, '0'),
        'I’d like to buy Module ' + String(n).padStart(2, '0') + ' — ' + title + '.'));
      foot.appendChild(buy);
    }
    card.appendChild(foot);
  });

  if (!checkoutLive) {
    document.querySelectorAll('[data-manual-text]').forEach(function (el) { el.textContent = el.getAttribute('data-manual-text'); });
  }
