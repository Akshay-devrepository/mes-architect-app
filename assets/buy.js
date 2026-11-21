// Sales-page logic (was inline; moved out so the CSP can forbid inline script).
// Prices, offers and the savings line are filled in by assets/pricing.js
  // from backend/src/pricing-config.js (via the API), in the visitor's
  // currency, so this page always shows what checkout charges.

// Until a real checkout link exists in assets/purchase-links.js, Buy opens
  // a prefilled email, and copy that promises automatic checkout swaps to its
  // data-manual-text so the page never claims something that isn't live yet.
  // Live links carry data-checkout, so purchase-links.js rebuilds them at
  // click time with the signed-in email (and module number) filled in.
  var links = window.PURCHASE_LINKS;
  // In-app checkout: every Buy button opens the app, which runs Razorpay
  // checkout for the signed-in account (www/assets/account.js).
  var inApp = !!(links && links.inApp);
  var checkoutLive = inApp || !!(links && links.bundle);
  var mail = 'mailto:primeatnit@gmail.com?subject=';
  function mailFor(subject, body) {
    return mail + encodeURIComponent('MES Architect: ' + subject) + '&body=' + encodeURIComponent(body + '\n\nHow do I pay?');
  }
  function wire(el, product, fallback) {
    if (inApp) {
      el.href = product === 'single' ? 'index.html' : 'index.html?buy=' + encodeURIComponent(product);
      return;
    }
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

  // Price + Buy button on each paid module card.
  document.querySelectorAll('.module-card:not(.free)').forEach(function (card) {
    var numEl = card.querySelector('.num');
    var match = numEl && /(\d{1,2})/.exec(numEl.textContent);
    var n = match ? parseInt(match[1], 10) : 0;
    var title = (card.querySelector('h3') || {}).textContent || ('Module ' + n);

    var foot = document.createElement('div');
    foot.className = 'module-foot';
    var badge = document.createElement('div');
    badge.className = 'module-price';
    badge.innerHTML = '<span data-price="module"></span><span class="price-off" data-price-off="module"></span>';
    foot.appendChild(badge);

    if (n >= 2 && n <= 17) {
      var buy = document.createElement('a');
      buy.className = 'module-buy';
      buy.textContent = 'Buy this module';
      // The accessible name starts with the visible text (WCAG 2.5.3).
      buy.setAttribute('aria-label', 'Buy this module: Module ' + String(n).padStart(2, '0') + ', ' + title);
      wire(buy, String(n), mailFor('Module ' + String(n).padStart(2, '0'),
        'I’d like to buy Module ' + String(n).padStart(2, '0') + ': ' + title + '.'));
      foot.appendChild(buy);
    }
    card.appendChild(foot);
  });
  if (window.MES_PRICING) window.MES_PRICING.fill();

  if (!checkoutLive) {
    document.querySelectorAll('[data-manual-text]').forEach(function (el) { el.textContent = el.getAttribute('data-manual-text'); });
  }
