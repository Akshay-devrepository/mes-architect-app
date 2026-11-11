// ══════════════════════════════════════════
// PURCHASE-LINKS.JS — single source of truth for where every "Buy" button
// points: the in-app purchase buttons (license.js) AND the standalone sales
// page (buy.html). One file to edit so the two surfaces can never drift.
//
// Fill these in once your Gumroad/LemonSqueezy product(s) exist, then
// redeploy. Plain runtime config — not part of the encryption build step,
// so prices/links can change anytime without re-running
// scripts/encrypt-modules.js or invalidating any keys already issued.
// Keys are 1-based module numbers to match LICENSE-KEYS-SECRET.md.
// ══════════════════════════════════════════
const PURCHASE_LINKS = {
  bundle: null, // e.g. 'https://yourname.gumroad.com/l/mes-architect-bundle'
  // buy.html's "Buy a single module" button — one checkout product with a
  // module picker (e.g. a Gumroad product with one variant per module).
  singleModule: null,
  modules: {
    // 2: 'https://yourname.gumroad.com/l/mes-isa95',
    // 3: 'https://yourname.gumroad.com/l/mes-isa88',
    // ...add one per module you sell individually
  }
};
window.PURCHASE_LINKS = PURCHASE_LINKS;
