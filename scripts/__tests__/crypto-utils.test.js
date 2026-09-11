const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, tryDecrypt, contentHash, deriveAesKey } = require('../lib/crypto-utils');

test('encrypt/tryDecrypt round-trip returns the original plaintext', () => {
  const plaintext = '<div>Hello, MES — ISA-95 Level 3</div>';
  const enc = encrypt(plaintext, 'correct-passphrase');
  assert.equal(tryDecrypt(enc, 'correct-passphrase'), plaintext);
});

test('tryDecrypt returns null for the wrong passphrase (never throws)', () => {
  const enc = encrypt('secret content', 'right-key');
  assert.equal(tryDecrypt(enc, 'wrong-key'), null);
});

test('tryDecrypt returns null when the ciphertext is tampered with', () => {
  const enc = encrypt('secret content', 'a-key');
  // Flip a character in the ciphertext — AES-GCM's auth tag must catch this.
  const ctBuf = Buffer.from(enc.ct, 'base64');
  ctBuf[0] ^= 0xff;
  const tampered = { ...enc, ct: ctBuf.toString('base64') };
  assert.equal(tryDecrypt(tampered, 'a-key'), null);
});

test('tryDecrypt returns null on malformed input instead of throwing', () => {
  assert.equal(tryDecrypt({ salt: 'not-real', iv: 'nope', ct: '???' }, 'x'), null);
  assert.equal(tryDecrypt(null, 'x'), null);
});

test('encrypt produces a fresh salt/iv every call (never reuses either)', () => {
  const a = encrypt('same plaintext', 'same passphrase');
  const b = encrypt('same plaintext', 'same passphrase');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct); // different IV alone guarantees different ciphertext
});

test('deriveAesKey accepts both a base64 string and a raw Buffer for the salt', () => {
  const saltBuf = Buffer.from('0123456789abcdef', 'hex');
  const fromBuf = deriveAesKey('pw', saltBuf);
  const fromB64 = deriveAesKey('pw', saltBuf.toString('base64'));
  assert.deepEqual(fromBuf, fromB64);
});

test('the bundle-key derivation pattern (key + "::sec-" + idx) is a distinct passphrase per module', () => {
  // This is exactly how translate.js and package-new-modules.js derive a
  // per-module passphrase from one shared bundle key — if two different
  // module indexes ever produced the same effective passphrase, content
  // encrypted for one module could be decrypted under the other's context.
  const enc = encrypt('module 3 content', 'MES-BUNDLE-x' + '::sec-3');
  assert.equal(tryDecrypt(enc, 'MES-BUNDLE-x' + '::sec-3'), 'module 3 content');
  assert.equal(tryDecrypt(enc, 'MES-BUNDLE-x' + '::sec-4'), null);
});

test('contentHash is deterministic and 16 characters', () => {
  const h1 = contentHash('some normalized text');
  const h2 = contentHash('some normalized text');
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
});

test('contentHash is sensitive to any change in the input text', () => {
  assert.notEqual(contentHash('Level 3'), contentHash('Level 4'));
});
