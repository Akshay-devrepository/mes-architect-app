// Splits a module's plaintext HTML into the same top-level "blocks"
// getTranslatableBlocks() works with in the browser, and hashes each one
// exactly like hashBlockElement() does — via jsdom's real DOM textContent
// implementation, not a hand-rolled regex approximation. Two separate real
// bugs slipped through regex-based approximations of this earlier in this
// project's life (tags stripped to a space instead of empty string; a bare
// "<" inside prose — e.g. "pH < 5.5" in an ASCII diagram — misread as a
// tag), so this exists specifically to not repeat that mistake in the
// tooling that's supposed to be catching it.

const { JSDOM } = require('jsdom');
const { contentHash } = require('./crypto-utils');

const sharedDom = new JSDOM('');

function hashBlocksOf(plaintextHtml) {
  const container = sharedDom.window.document.createElement('div');
  container.innerHTML = plaintextHtml;
  return Array.from(container.children).map((el) => hashElement(el));
}

function hashElement(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.star-btn').forEach((b) => b.remove());
  const text = clone.textContent.replace(/\s+/g, ' ').trim();
  return contentHash(text);
}

module.exports = { hashBlocksOf, hashElement };
