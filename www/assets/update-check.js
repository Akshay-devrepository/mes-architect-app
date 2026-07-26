// ══════════════════════════════════════════
// UPDATE-CHECK.JS — for the installed Android app only.
// window.APP_VERSION_CODE is 0 on the plain website (build-version.js's
// default) and a real, increasing number inside every APK built by CI,
// so this whole feature quietly no-ops in the browser.
//
// Checks for a newer build as soon as the app has a network connection
// (on launch if already online, and again the moment "online" fires),
// by comparing against version.json served fresh from GitHub Pages.
// ══════════════════════════════════════════

(function () {
  const VERSION_URL = 'https://akshay-devrepository.github.io/mes-architect-app/version.json';
  const DISMISSED_KEY = 'mes_update_dismissed_version';
  const isNativeBuild = typeof window.APP_VERSION_CODE === 'number' && window.APP_VERSION_CODE > 0;

  let checked = false;
  let checking = false;

  function buildBanner(remote) {
    if (document.getElementById('updateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.innerHTML =
      '<div class="update-banner-text">' +
        '<strong>Update available</strong> — v' + escapeHtml(remote.versionName) + ' is ready to install.' +
      '</div>' +
      '<div class="update-banner-actions">' +
        '<button id="updateNowBtn">Update Now</button>' +
        '<button id="updateLaterBtn">Later</button>' +
      '</div>';
    document.body.appendChild(banner);

    document.getElementById('updateNowBtn').addEventListener('click', () => {
      // "_system" opens the OS's default browser without any extra Capacitor
      // plugin — Android then hands the .apk download to the system Download
      // Manager, exactly like tapping a normal download link.
      window.open(remote.apkUrl, '_system');
    });
    document.getElementById('updateLaterBtn').addEventListener('click', () => {
      localStorage.setItem(DISMISSED_KEY, String(remote.versionCode));
      banner.remove();
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function checkForUpdate() {
    if (!isNativeBuild || checking || !navigator.onLine) return;
    checking = true;
    fetch(VERSION_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((remote) => {
        checking = false;
        checked = true;
        if (!remote || typeof remote.versionCode !== 'number') return;
        if (remote.versionCode <= window.APP_VERSION_CODE) return;
        const dismissed = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
        if (dismissed >= remote.versionCode) return;
        buildBanner(remote);
      })
      .catch(() => { checking = false; });
  }

  function addManualCheckLink() {
    const footer = document.getElementById('sidebarFooter');
    if (!footer) return;
    const row = document.createElement('div');
    row.id = 'updateCheckRow';
    row.innerHTML =
      '<span id="updateCheckLink">Check for updates</span>' +
      ' <span id="updateCheckStatus"></span>' +
      '<div id="updateCheckVersion">v' + escapeHtml(window.APP_VERSION_NAME || '') + '</div>';
    footer.appendChild(row);

    document.getElementById('updateCheckLink').addEventListener('click', () => {
      const status = document.getElementById('updateCheckStatus');
      status.textContent = 'checking…';
      const before = document.getElementById('updateBanner');
      checkForUpdate();
      setTimeout(() => {
        const after = document.getElementById('updateBanner');
        status.textContent = after ? '' : (navigator.onLine ? 'up to date' : 'offline');
        if (status.textContent) setTimeout(() => { status.textContent = ''; }, 2500);
      }, 900);
    });
  }

  if (isNativeBuild) {
    window.addEventListener('online', checkForUpdate);
    document.addEventListener('DOMContentLoaded', () => {
      addManualCheckLink();
      if (navigator.onLine) checkForUpdate();
    });
  }

  // Exposed for a manual "Check for updates" action elsewhere in the UI.
  window.checkForAppUpdate = checkForUpdate;
})();
