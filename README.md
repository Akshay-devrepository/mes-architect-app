# MES Architect — Concept Board & Interview Prep

An interactive study app for MES / ISA-95 / ISA-88 / manufacturing architecture concepts, built for interview prep. Runs as a website, an installable PWA, and an Android app.

## Features

- **16 concept modules** — ISA-95, ISA-88, MES functional modules, enterprise architecture, cloud migration, database design, implementation lifecycle, industry-specific MES, AI in manufacturing, and more.
- **★ Bookmarks** — star any concept card or interview question; revisit them all from the **Saved** tab.
- **Quiz Mode** — every "Show Consultant Answer" question on the board, plus a hand-written set of calculation drills, acronym checks, and compare/contrast cards, turned into a flip-card deck. Rate yourself after each card; unmastered ones resurface until you get them.
- **AI doubt-solver** — an "Ask AI" chat (and a floating quick-launch button from any page) powered by [Puter.js](https://developer.puter.com/), which gives free access to Claude/GPT models client-side with **no API key required**.
- **Installable** — add-to-home-screen as a PWA, or install the built APK directly on Android.

## Run locally

```bash
npm install
npm run serve
```

Then open http://localhost:5173.

## Deploy the website

Push to `main` — the `deploy-pages.yml` workflow publishes `www/` to GitHub Pages automatically. Enable Pages once under **Settings → Pages → Source: GitHub Actions**.

## Build the Android APK

**Automatically (recommended):** push to `main`, or go to **Actions → Build Android APK → Run workflow**. The signed-debug APK is uploaded as a build artifact and attached to a GitHub Release tagged `apk-<run number>`.

**Locally** (requires Android Studio / JDK 17 + Android SDK installed):

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug   # macOS/Linux
gradlew.bat assembleDebug # Windows
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Project structure

```
www/                 the actual web app (this is what ships)
  index.html          all 18 modules — content + inline styles/scripts
  assets/
    enhance.css        styles for stars, saved cards, quiz cards, the AI FAB
    enhance.js         bookmark + quiz engine logic (scans the DOM, no build step)
    quiz-data.js       hand-curated bonus quiz cards (calculations, acronyms, scenarios)
  manifest.json         PWA manifest
  sw.js                 service worker (offline app-shell caching)
  icons/                app icons
android/               Capacitor-generated native Android project
resources/            master icon/splash source images (used by `capacitor-assets`)
```

## Notes on the AI chat

Puter.js needs no signup or API key, but the **first time** you use it in a fresh browser or on a new device, it may open a small popup asking you to continue as a guest — allow popups for the site once and it won't ask again. There's no cost and nothing to configure.

## Adding new content or quiz cards

- New concept cards: add a `.dd-wrap` block anywhere in `www/index.html` following the existing markup — stars are attached automatically at load time.
- New quiz-only questions: add entries to `window.QUIZ_DATA_EXTRA` in `www/assets/quiz-data.js`.
- Any `.q-box` (question + "Show Consultant Answer") you add is automatically pulled into the Quiz Mode deck too.
