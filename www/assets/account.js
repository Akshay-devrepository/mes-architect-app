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

  let idToken = null;
  let idTokenExp = 0;
  let owned = [];
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

  async function api(path, init) {
    const token = await getIdToken(false);
    if (!token) throw new Error('sign-in-required');
    const res = await fetch(cfg.apiBase + path, {
      ...(init || {}),
      headers: { ...((init && init.headers) || {}), 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || ('http-' + res.status));
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
    return me;
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
    box.replaceChildren();
    box.appendChild(el('div', { class: 'global-license-label', text: '👤 Your account' }));
    const status = el('div', { class: 'global-license-status', id: 'accountStatus', text: state.message || '' });

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
      box.appendChild(el('div', { class: 'global-license-hint', text: state.sections + ' of 16 modules unlocked on this account.' }));
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
      const me = await sync();
      render({ email: c.email, verified: true, sections: me.sections.length });
    } catch (e) {
      render({ email: c.email, verified: true, sections: owned.length, message: e.message === 'sign-in-required' ? '' : 'Couldn’t reach the server — showing what’s already on this device.' });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (loadSession()) afterSignIn(false);
    else render({});
  });
})();
