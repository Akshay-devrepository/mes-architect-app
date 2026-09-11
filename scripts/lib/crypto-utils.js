// Shared AES-256-GCM + PBKDF2 helpers — the exact scheme scripts/encrypt-
// modules.js and scripts/generate-translations.js use to lock content, and
// the exact scheme www/assets/license.js and translate.js use to unlock it
// (Web Crypto on that side, Node's crypto here; both are AES-256-GCM with
// a 12-byte IV and the auth tag appended to the ciphertext, which is the
// wire format Web Crypto expects natively). Kept in one place so
// scripts/check-translation-sync.js and its tests can't drift apart.

const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;

function deriveAesKey(passphrase, saltB64OrBuf) {
  const salt = Buffer.isBuffer(saltB64OrBuf) ? saltB64OrBuf : Buffer.from(saltB64OrBuf, 'base64');
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

function encrypt(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = deriveAesKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, tag]).toString('base64'),
  };
}

// Returns the decrypted plaintext string, or null on any failure (wrong
// passphrase, tampered ciphertext, malformed input) — callers treat "not
// decryptable" as one case, never distinguishing why, exactly like the
// app's own tryDecrypt() does.
function tryDecrypt(encObj, passphrase) {
  try {
    const key = deriveAesKey(passphrase, encObj.salt);
    const iv = Buffer.from(encObj.iv, 'base64');
    const raw = Buffer.from(encObj.ct, 'base64');
    const tag = raw.subarray(raw.length - 16);
    const ct = raw.subarray(0, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('base64').slice(0, 16);
}

module.exports = { PBKDF2_ITERATIONS, deriveAesKey, encrypt, tryDecrypt, contentHash };
