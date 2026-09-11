const test = require('node:test');
const assert = require('node:assert/strict');
const { hashBlocksOf, hashElement } = require('../lib/block-hash');
const { JSDOM } = require('jsdom');

test('hashBlocksOf finds one hash per top-level child element', () => {
  const hashes = hashBlocksOf('<div>one</div><p>two</p><h2>three</h2>');
  assert.equal(hashes.length, 3);
});

test('regression: adjacent tags produce NO synthetic whitespace between them (real textContent behavior)', () => {
  // <td>A</td><td>B</td> is "AB" in a real browser, never "A B" — a
  // regex-based hasher that stripped tags to a single space instead of an
  // empty string silently desynced from the real runtime hash for every
  // module that used adjacent inline elements. Pin the correct behavior.
  const [adjacent] = hashBlocksOf('<div><td>A</td><td>B</td></div>');
  const [withRealSpace] = hashBlocksOf('<div><td>A</td> <td>B</td></div>');
  const dom = new JSDOM('<div><td>A</td><td>B</td></div>');
  assert.equal(dom.window.document.body.firstChild.textContent, 'AB');
  assert.notEqual(adjacent, withRealSpace); // "AB" must hash differently from "A B"
});

test('regression: a bare "<" used as a comparison operator is not a tag boundary', () => {
  // A real bug: an ASCII diagram containing literal text like
  // "pH < 5.5 -> hold" was misread by an earlier tag-stripping regex as
  // the start of a tag, silently eating everything up to the next ">"
  // and corrupting the hash. The block's actual rendered text must
  // include the full "pH < 5.5" phrase untouched.
  const html = '<div><pre>pH < 5.5 -> hold -> notify QA</pre></div>';
  const dom = new JSDOM(html);
  const el = dom.window.document.body.firstChild;
  assert.match(el.textContent, /pH < 5\.5/);
  // And hashElement must not throw or silently truncate on this input.
  const hash = hashElement(el);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 16);
});

test('hashElement ignores a .star-btn injected at runtime (bookmark toggle)', () => {
  const withoutStar = new JSDOM('<div class="dd-wrap"><div class="dd-title">Title</div></div>')
    .window.document.querySelector('.dd-wrap');
  const withStar = new JSDOM(
    '<div class="dd-wrap"><div class="dd-title">Title</div><div class="star-btn">☆</div></div>'
  ).window.document.querySelector('.dd-wrap');
  assert.equal(hashElement(withoutStar), hashElement(withStar));
});

test('hashElement normalizes whitespace the same way regardless of source formatting', () => {
  const compact = new JSDOM('<div>Hello   world</div>').window.document.querySelector('div');
  const spread = new JSDOM('<div>\n  Hello\n  world\n</div>').window.document.querySelector('div');
  assert.equal(hashElement(compact), hashElement(spread));
});

test('hashElement is sensitive to real text changes (not a no-op hash)', () => {
  const a = new JSDOM('<div>Version A</div>').window.document.querySelector('div');
  const b = new JSDOM('<div>Version B</div>').window.document.querySelector('div');
  assert.notEqual(hashElement(a), hashElement(b));
});
