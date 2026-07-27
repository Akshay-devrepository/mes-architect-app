# MES Architect — Concept Board & Interview Prep

An interactive study app for MES / ISA-95 / ISA-88 / manufacturing architecture concepts, built for interview prep. Runs as a website, an installable PWA, and an Android app.

## Features

- **16 concept modules** — ISA-95, ISA-88, MES functional modules, enterprise architecture, cloud migration, database design, implementation lifecycle, industry-specific MES, AI in manufacturing, and more.
- **★ Bookmarks** — star any concept card or interview question; revisit them all from the **Saved** tab.
- **Quiz Mode** — every "Show Consultant Answer" question on the board, plus a hand-written set of calculation drills, acronym checks, and compare/contrast cards, turned into a flip-card deck. Rate yourself after each card; unmastered ones resurface until you get them.
- **AI doubt-solver** — an "Ask AI" chat (and a floating quick-launch button from any page) powered by [Puter.js](https://developer.puter.com/), which gives free access to Claude/GPT models client-side with **no API key required**.
- **Installable** — add-to-home-screen as a PWA, or install the built APK directly on Android.
- **In-app update checks** — the installed Android app checks for a newer build the moment it has an internet connection (on launch and again the instant connectivity returns) and prompts you to update if one's available. The plain website doesn't nag about this — it stays current on its own via the service worker.
- **Licensed modules** — module 1 is a free trial; modules 2–16 are encrypted and unlock with a license key, sold per-module or as a full bundle. See "Selling licensed access" below.

## Run locally

```bash
npm install
npm run serve
```

Then open http://localhost:5173.

## Deploy the website

Push to `main` — the `deploy-pages.yml` workflow publishes `www/` to GitHub Pages automatically. Enable Pages once under **Settings → Pages → Source: GitHub Actions**.

## Build the Android APK

**Automatically (recommended):** push to `main`, or go to **Actions → Build Android APK → Run workflow**. The debug APK is renamed to `MES-Architect.apk` (a stable filename, so the "latest release" download link never changes), uploaded as a build artifact, and attached to a GitHub Release tagged `apk-<run number>`.

**Locally** (requires Android Studio / JDK 17 + Android SDK installed):

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug   # macOS/Linux
gradlew.bat assembleDebug # Windows
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## How update checks work

Both CI workflows stamp the **same version number** — `git rev-list --count HEAD`, i.e. the commit count — onto every build, from two independent sources that always agree because they run on the same commit:

- `build-apk.yml` writes that number into `android/app/build.gradle` (`versionCode`/`versionName`) and into `www/assets/build-version.js` (`window.APP_VERSION_CODE`), which gets baked into the APK.
- `deploy-pages.yml` writes the same number into `www/version.json`, published live at `https://<user>.github.io/mes-architect-app/version.json`.

`www/assets/update-check.js` runs only when `APP_VERSION_CODE > 0` (i.e. only inside the installed app, never on the plain website). It fetches `version.json` fresh (no-cache) on launch and again the instant the `online` event fires, and shows an in-app banner with an **Update Now** button (opens the OS browser to the latest GitHub Release APK — no extra native plugin needed) whenever the live version is newer than the installed one. There's also a manual "Check for updates" link in the sidebar footer.

## Selling licensed access

Modules 2–16 ship **encrypted** inside `www/index.html` (AES-256-GCM via the
browser's native Web Crypto API) — only module 1 and the Quiz/Saved tabs are
plaintext. This is a **client-side-only** scheme with no backend or server,
which means it's honest about a real trade-off:

- ✅ Locked module content is genuinely absent from the page — view-source
  or a network inspector on a locked module shows only ciphertext, never
  the real text. A wrong key fails cleanly (no garbled partial output).
- ⚠️ Once a *correct* key decrypts a module in someone's browser, the
  plaintext exists in that browser's memory/DOM — a sufficiently determined
  person could still extract it from their own unlocked copy afterwards
  (e.g. by saving the rendered page). There's no way to fully prevent that
  without a real backend that never sends plaintext to unlicensed clients,
  which is a much bigger project. This scheme deters casual sharing and
  makes piracy require real effort; it isn't DRM.
- ⚠️ Every buyer of a given module gets the **same** key for that module
  by default (there's no backend of your own generating unique-per-purchase
  keys). If someone posts their key publicly, that module is effectively
  free until you rotate its key (re-run the script below and re-sell).
  **The Keygen.sh integration below fixes this specific weakness** — each
  buyer gets their own distinct, individually-revocable key — without
  requiring you to build or host a backend.

### How it works

- **Per-module keys** unlock just that one module.
- **One bundle key** unlocks all 15 paid modules at once — enter it in the
  sidebar's "🔑 Have a license key?" box and every locked module unlocks
  immediately, no need to visit each one.
- Unlocking is remembered per device (localStorage), so it only needs to
  happen once.
- Every module/bundle key generated by `scripts/encrypt-modules.js` still
  works as a raw passphrase pasted directly into the app (no internet
  needed) — useful for testing, or for handing a key to someone manually.
  The Keygen.sh layer below is optional and sits *in front of* this, giving
  each buyer their own distinct, revocable key instead of everyone sharing
  the same one.

### Real per-buyer keys via Keygen.sh (recommended)

Without Keygen, every buyer of "Module 3" gets the *same* key — fine to
start, but if it leaks, that module is free until you regenerate it. Keygen
gives each buyer their own unique, individually-revocable license key, live
validation with no backend to run (their `validate-key` endpoint needs no
secret token and is safe to call directly from the browser — confirmed
during development), for free at low volume.

1. Sign up at [keygen.sh](https://keygen.sh/) (free tier: 2,000 API
   requests/day, 100 active licensed users).
2. Create one Policy (any name — e.g. "Standard"). You only need one; which
   module(s) a license unlocks is stored on the *license* itself, not the
   policy.
3. For each sale, create a License under that policy and set its
   `metadata.unlockKey` to the matching key from `LICENSE-KEYS-SECRET.md`
   (a single module's key for an individual sale, the bundle key for a
   bundle sale). Keygen auto-generates the license key string — that's what
   you deliver to the buyer (via Gumroad/LemonSqueezy's receipt/delivery
   content, same as below, just with a Keygen-issued key instead of a raw
   passphrase).
4. Put your Keygen account ID (the slug in your dashboard URL — public, not
   a secret) into `KEYGEN_ACCOUNT_ID` at the top of
   `www/assets/license.js`, then redeploy.

When a buyer enters their Keygen key, the app validates it live against
Keygen, reads `metadata.unlockKey` from the response, and only *then* uses
that to decrypt — the real AES passphrase never reaches the buyer or the
client bundle directly. An expired/suspended/banned key shows a specific
message instead of a generic "wrong key". If `KEYGEN_ACCOUNT_ID` is left
blank, or Keygen can't be reached, or the input isn't a Keygen key at all,
the app transparently falls back to treating the input as a raw passphrase
— so this is safe to leave unconfigured, and safe to adopt later without
re-encrypting anything.

### Setting up sales (Gumroad / LemonSqueezy)

1. Run `node scripts/encrypt-modules.js` locally (see below) — this writes
   `LICENSE-KEYS-SECRET.md` at the repo root with the bundle key and all 15
   individual module keys. **This file is gitignored on purpose — never
   commit it, paste it into an issue/PR, or send it anywhere but to
   yourself.**
2. On Gumroad or LemonSqueezy, create one product per module you're selling
   individually, plus one "Full Bundle" product. Do **not** use their
   built-in auto-generated license-key feature (that's for verifying against
   *their* API, which this app doesn't call) — instead, set each product's
   delivery content/receipt text to contain the actual key the buyer should
   paste into the app: a Keygen-issued key if you set up the section above
   (recommended), or the raw key straight from `LICENSE-KEYS-SECRET.md` if
   you're skipping Keygen for now.
3. Put each product's checkout/purchase URL into `PURCHASE_LINKS` near the
   top of `www/assets/license.js` (1-based module number → URL, plus a
   `bundle` URL) and redeploy. This is what powers the "💳 Buy access"
   buttons on locked modules, locked Home cards, and the sidebar — without
   it, locked modules just show "contact the seller" instead of a link.
   Nothing here touches encryption/keys, so you can update prices or swap
   links anytime with a plain redeploy.
3. Set your own prices — that's entirely up to you; nothing in the app
   depends on price.

### Rotating or re-generating keys

Re-running `node scripts/encrypt-modules.js` regenerates **every** key from
scratch (invalidating any already sold) and re-encrypts `www/index.html`.
After running it:

```bash
npx cap sync android   # bake the newly-encrypted content into the Android build too
```

Then commit `www/index.html` (safe — only ciphertext) and push as normal.
**Never** commit `LICENSE-KEYS-SECRET.md`.

## Project structure

```
www/                 the actual web app (this is what ships)
  index.html          all 18 modules — content + inline styles/scripts
                       (modules 2-16's bodies are AES-256-GCM ciphertext post-encryption)
  assets/
    enhance.css        styles for stars, saved cards, quiz cards, the AI FAB, update banner, lock gate
    enhance.js         bookmark + quiz engine logic (scans the DOM, no build step)
    quiz-data.js       hand-curated bonus quiz cards (calculations, acronyms, scenarios)
    license.js         client-side unlock logic (Web Crypto AES-GCM decrypt, see "Selling licensed access")
    build-version.js   CI-stamped app version (native builds only; see "How update checks work")
    update-check.js    checks version.json and prompts to update inside the installed app
  manifest.json         PWA manifest
  version.json           CI-stamped latest version + APK download URL
  sw.js                 service worker (offline app-shell caching)
  icons/                app icons
scripts/
  encrypt-modules.js    build step that locks modules 2-16 behind a license key (see above)
android/               Capacitor-generated native Android project
resources/            master icon/splash source images (used by `capacitor-assets`)
LICENSE-KEYS-SECRET.md  the actual keys — gitignored, exists only after you run the script locally
```

## Notes on the AI chat

Puter.js needs no signup or API key, but the **first time** you use it in a fresh browser or on a new device, it may open a small popup asking you to continue as a guest — allow popups for the site once and it won't ask again. There's no cost and nothing to configure.

## Adding new content or quiz cards

- New concept cards: add a `.dd-wrap` block anywhere in `www/index.html` following the existing markup — stars are attached automatically at load time.
- New quiz-only questions: add entries to `window.QUIZ_DATA_EXTRA` in `www/assets/quiz-data.js`.
- Any `.q-box` (question + "Show Consultant Answer") you add is automatically pulled into the Quiz Mode deck too.
