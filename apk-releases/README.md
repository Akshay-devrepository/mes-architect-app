# APK release archive

Local-only archive of each shipped APK, kept so you can install and compare
functionality across versions side by side. Not tracked in git (`*.apk` is
gitignored) — this folder lives only on this machine.

Note: on 2026-09-09 the drive holding this folder filled up (1GB total),
blocking a build download/verify. The 49 oldest APKs (v1.0.24–v1.0.98) were
deleted to free space — only the 10 most recent are kept on disk now. This
table below still records every version ever shipped; only the binaries for
the older ones are gone.

Naming: `MES-Architect-v<version>-<feature>.apk`

## Enabling the translation-sync CI check (optional)

`scripts/check-translation-sync.js` runs in the Build Android APK workflow
on every push. It decrypts each module's current English content with the
bundle key, re-hashes it, and fails the build if any shipped translation
no longer matches — catching a content edit that silently un-translates a
block before a user ever notices, instead of after. Without a key it just
prints a warning and passes (so this is safe to leave off).

To turn it on, add the bundle key from `LICENSE-KEYS-SECRET.md` as a repo
secret named `MES_BUNDLE_KEY`:

```bash
gh secret set MES_BUNDLE_KEY
```

(paste the key when prompted — it's the same value already gitignored in
`LICENSE-KEYS-SECRET.md`, now also held by GitHub Actions' encrypted
secret store, the same trust boundary `GROQ_API_KEY` already lives in).

## Generating missing translations (Actions → Generate translations)

`scripts/generate-translations.js` fills in only what's missing or stale:
blocks that already have a matching translation are kept, other modules and
languages in a file are never touched, and a module is written only once all
of its blocks are translated (the app offers a language only at full coverage).

1. Add one more secret, the **whole** `LICENSE-KEYS-SECRET.md` (individual
   keys are needed so translations also unlock for single-module buyers):

   ```bash
   gh secret set LICENSE_KEYS_MD < LICENSE-KEYS-SECRET.md
   ```

2. Run **Actions → Generate translations → Run workflow** with the languages
   (default `fr,ja,ko,it`, the ones currently incomplete) and optionally the
   module numbers as shown in the app.
3. Groq's free tier is rate-limited, so one run may not finish everything. It
   stops cleanly after ~5h20m, pushes what's done, and the next run resumes
   from an encrypted checkpoint. The run summary says which modules are done.
4. Each run pushes a `translations/run-N` branch; open a PR from the link in
   the run summary so the normal PR checks (including the sync check) run.

Locally: `GROQ_API_KEY=gsk_... node scripts/generate-translations.js` with
`LICENSE-KEYS-SECRET.md` in the repo root (`TRANSLATE_LANGS`,
`TRANSLATE_MODULES` (0-based), `TRANSLATE_MODEL`, `TIME_BUDGET_MIN` optional).

| Version | Feature added                          |
|---------|-----------------------------------------|
| 1.0.24  | Progress Dashboard                      |
| 1.0.26  | Mock Interview Mode                     |
| 1.0.28  | Streaming AI responses                  |
| 1.0.30  | Voice input/output for AI Coach         |
| 1.0.32  | Continue-where-you-left-off card (Home) |
| 1.0.34  | In-app feedback/report-issue button     |
| 1.0.36  | Locked-module "what's inside" preview   |
| 1.0.38  | On-demand module translation (Groq)     |
| 1.0.44  | AI keyword-matching fix + Ask AI FAB hides in chat |
| 1.0.46  | Mock Interview & Quiz Mode renamed + locked |
| 1.0.48  | ISA-95 & ISA-88 Deep Dive cards         |
| 1.0.50  | Mind map diagrams (Module 1 + Module 12) |
| 1.0.52  | Fix: mobile tables scroll instead of breaking words |
| 1.0.54  | Fix: mobile/tablet tables use card layout, no scroll |
| 1.0.56  | Settings panel + text size control            |
| 1.0.58  | Hardware back button + exit confirmation (needs on-device test) |
| 1.0.60  | Device language pre-selected in Translate dropdown |
| 1.0.62  | "Coming soon" purchase placeholder             |
| 1.0.64  | SVG diagrams: ISA-95, order flow, traceability, integration |
| 1.0.66  | Fix: translate default, unlock consistency, real Purchase Access button |
| 1.0.68  | Module 4 rewrite: standardized structure across all functional modules, added Recipe/EBR module |
| 1.0.70  | Fix: search-coverage undercount, showSection() crash guard (full app audit) |
| 1.0.72  | Fix: translate controls dim/disable on locked modules (full app audit) |
| 1.0.76  | Keygen.sh live: real account ID wired in, 2-device-cap license tooling added |
| 1.0.78  | Module reorder: Learning Roadmap is now the free Module 1, all 16 modules resequenced by roadmap/significance |
| 1.0.80  | Interview question bank expanded to 209 questions across 28 categories |
| 1.0.82  | All 209 interview answers restructured (bullets/steps instead of dense paragraphs), fixed matching Quiz/Mock Interview flip-card text extraction |
| 1.0.84  | Stale-state migration guard, study streaks, merged split FOUNDATIONAL track |
| 1.0.86  | Removed voice input/output from AI Coach (unreliable), expand/minimize button pinned to corner |
| 1.0.88  | Fixed maximized AI chat scroll cut off on mobile, expanded AI keyword gate with ~70 MES terms |
| 1.0.90  | Added curiosity-hook teaser copy to Module 2's locked gate |
| 1.0.92  | Added curiosity-hook teaser copy to all 16 locked modules |
| 1.0.93  | Migrated off deprecated Groq model (llama-3.3-70b-versatile shutdown); AI Coach and Translation now use separate models/quota pools (gpt-oss-120b / qwen3.6-27b) |
| 1.0.95  | Fixed translation silently failing: qwen3.6-27b (1.0.93) inlined its reasoning into the response and corrupted output — switched Translation to gpt-oss-20b, trimmed max_tokens, added retry handling for Groq's 413 "request too large for window" response alongside the existing 429 handling |
| 1.0.96  | Modules 2-3 now ship with pre-translated content (Spanish, French, German, Mandarin, Arabic, Japanese) — encrypted the same way as English, swapped in instantly with zero live API calls, replacing Groq's live per-card translation for these modules (Groq's free tier is too rate/quota-limited to be reliable at real scale, shared across every user) |
| 1.0.97  | Extended pre-translated coverage from cards only to every content block (headings, diagrams, tables, Purdue layers, resource grids, accordions) — Module 3 went from 3/24 blocks covered to 24/24. Language dropdown now only lists languages with complete coverage per module instead of always offering all 10 |
| 1.0.98  | Swapped pre-translated language set: dropped Spanish and Arabic, added Korean and Italian (now Chinese, Japanese, German, Korean, Italian, French) — all 35 blocks translated directly for the two new languages since there was no prior card to recover |
| 1.0.99  | Chinese coverage extended to Modules 4-7 (ISA-88 Batch Control, MES Functional Modules, Industry-Specific MES, Concept Visualizations). Also fixed a hash-desync bug where a literal "<" in an ASCII diagram (pH < 5.5) was mis-parsed as a tag, silently rejecting a fully translated module |
| 1.0.100 | Chinese coverage extended to Module 8 (Enterprise Architecture) — Chinese now covers Modules 2-8 |
| 1.0.101 | Chinese coverage extended to Module 9 (Cloud Migration) — Chinese now covers Modules 2-9 |
| 1.0.103 | Chinese coverage extended to Module 10 (Database & Data Models) — Chinese now covers Modules 2-10 |
| 1.0.104 | Chinese coverage extended to Module 11 (MES Integration Deep Dive) — the largest module (26 blocks, ~313K chars). Chinese now covers Modules 2-11 |
| 1.0.105 | Chinese coverage extended to Module 12 (Advanced Topics) — Chinese now covers Modules 2-12 |
| 1.0.106 | Chinese coverage extended to Module 13 (AI in Manufacturing) — 35 blocks, ~228K chars. Chinese now covers Modules 2-13 |
| 1.0.107 | Chinese coverage extended to Module 14 (Implementation Lifecycle) — Chinese now covers Modules 2-14 |
| 1.0.108 | Chinese coverage extended to Module 15 (Consultant Mindset) — Chinese now covers Modules 2-15 |
| 1.0.109 | Chinese coverage extended to Module 16 (AI Interview Coach) — Chinese pre-translated content now COMPLETE across all 16 paid modules |
| 1.0.110 | German coverage extended to Module 4 (ISA-88 Batch Control) — German now covers Modules 2-4 |
| 1.0.111 | German coverage extended to Module 5 (MES Functional Modules) — German now covers Modules 2-5 |
| 1.0.112 | German coverage extended to Module 6 (Industry-Specific MES) — German now covers Modules 2-6 |
| 1.0.113 | German coverage extended to Module 7 (Concept Visualizations) — German now covers Modules 2-7 |
| 1.0.114 | German coverage extended to Module 8 (Enterprise Architecture) — German now covers Modules 2-8 |
| 1.0.115 | German coverage extended to Module 9 (Cloud Migration) — German now covers Modules 2-9 |
| 1.0.116 | German coverage extended to Module 10 (Database & Data Models) — German now covers Modules 2-10 |
| 1.0.117 | German coverage extended to Module 11 (MES Integration Deep Dive) — the largest module (26 blocks, ~313K chars). German now covers Modules 2-11 |
| 1.0.119 | German coverage extended to Module 12 (Advanced Topics) — German now covers Modules 2-12 |
| 1.2.122 | Version scheme bumped to 1.2.x to mark the German-language milestone. German coverage extended to Module 13 (AI in Manufacturing) — 35 blocks, ~228K chars. German now covers Modules 2-13 |
| 1.3.25  | Version scheme now rolls the patch number into minor once it passes 100 (1.2.100 → 1.3.0) instead of growing a 3rd digit. German coverage extended to Module 14 (Implementation Lifecycle) — German now covers Modules 2-14 |
| 1.3.27  | German coverage extended to Module 15 (Consultant Mindset) — German now covers Modules 2-15 |
| 1.3.29  | German coverage extended to Module 16 (AI Interview Coach) — German pre-translated content now COMPLETE across all 16 paid modules |
| 1.3.31  | Fixed AI chat full-screen: added a top margin instead of running flush to the viewport edge; fixed page scroll getting stuck after minimizing (locked/unlocked `<html>` too, since it's the real scrolling element, not `<body>`; blur the auto-focused input on minimize; force a reflow) |
| 1.3.33  | Expanded the AI Coach's keyword gate — it was refusing questions containing terms the app's own glossary teaches (B2MML, Level 0/1, QMS, LIMS, WIP) plus Euromap and ~35 other real MES/manufacturing terms across verticals (plastics, semiconductor, packaging, maintenance, lean/quality) that weren't on the allowlist |
| 1.3.35  | Added an interactive mind map for every module — a "🧠 Mindmap" button opens a full-screen, pan/zoomable SVG tree built from that module's own real heading/content structure (extracted live from the unlocked DOM, then grouped and shortened for legibility). Hand-rolled renderer, no external library; visible even on locked modules as a structural preview |
| 1.3.37  | Fixed deep-dive cards reverting to English after translating a module. Two causes: (1) a language was offered even when no decryption key was cached (returning session), so every block silently fell to the live API path — now shows "re-enter your license key" instead; (2) the live fallback sent whole cards past its token ceiling and got truncated responses that failed validation — now splits large cards into child fragments, translates each in budget, and reassembles |
| 1.3.39  | Removed the live Groq API translation fallback entirely (~130 lines). Every offered language is fully pre-translated offline now, so the fallback was pure downside — rate limits and truncated deep-dive cards. A block whose English text changed after its translation was generated now just stays in English and says so. AI Coach chat still uses Groq |
| —       | (infra) Service-worker cache name is now CI-stamped (`mes-architect-v<commit count>`) instead of hand-edited in sw.js on every ship — the commit before this one, no user-facing version bump |
| 1.3.42  | Lazy-load translation files — ~10 MB off every cold start. Only a ~10 KB hashes-only manifest loads up front (enough to decide which languages the dropdown offers); the full per-language file (de.js/zh.js are ~4.5 MB each) fetches on demand the first time that language is actually picked, then is cached for offline use |
| —       | (infra, no app change) Added scripts/check-translation-sync.js — a CI guard that decrypts current English content and fails the build if any shipped translation's hash no longer matches (opt-in via a new MES_BUNDLE_KEY repo secret, see below; skips harmlessly until set) |
| —       | (infra, no app change) Added the project's first automated test suite — 15 tests (node:test, zero new deps beyond jsdom) covering the AES/PBKDF2 crypto round-trip and the content-hash function, including regression tests pinning the two real hash-desync bugs found this session. Runs in CI before every build |
| 1.3.49  | Sales page (buy.html, web): per-module $9.99/₹249 and early-bird bundle $99.99/₹2,499 pricing, credibility line filled, and copy that stays honest until checkout is live (Buy opens a prefilled email; "automatic delivery" wording only appears once a checkout link is set in purchase-links.js). AI Coach: switched to Qwen3.8 27B (won a head-to-head on interview-coaching quality and speed) with automatic fallback to GPT-OSS 120B → 20B — each has its own free quota, so ~3x daily capacity and no outage when Groq retires a model. Fixed answers cutting off mid-sentence (hidden reasoning tokens were eating the 900-token budget). Fixed long chats failing with 413 (history now trimmed to stay under Groq's 8K tokens/min). Fixed multi-turn mock interviews: the keyword gate now only screens the first message, so replies like "continue" or "score my answer" are no longer refused |
| 1.3.52  | AI Coach now coaches each buyer at their own level instead of assuming every user is the app's author (a 6+-year senior). The first time someone chats, the coach asks their MES experience (New to MES / 1–3 / 4–7 / 8+ years, or Skip) with one-tap buttons, remembers it on that device, and shows a one-line "Coaching level · change" note in later sessions. No extra AI calls — the level just shapes the system prompt (entry-level gets jargon explained and fundamentals; architects get peer-level governance and business-value framing). Sales page credibility line now cites 8+ years and learning alongside senior MES architects |
| 1.3.53  | Security hardening. Patched a critical Capacitor Android advisory (GHSA-rvm3-566m-v7fv: remote content could load at the app's origin) — Capacitor 8.4.2 → 8.5.3, vendored runtime synced; npm advisories 17 → 7 (all remaining in dev-only build tools). Android backups and phone-to-phone transfer can no longer copy the cached unlock key or decrypted modules off the device. Content-Security-Policy on the app and sales page: the app can only talk to itself, Groq, Keygen and its own update feed — verified blocking injected fetch/pixel exfiltration. Fonts self-hosted (no visitor IP sent to Google — GDPR — and they now work offline). Update banner only opens downloads from this repo's own GitHub releases. Added SECURITY.md |
| —       | (infra, 1.3.54–1.3.56) Release signing wired into CI (private keystore via GitHub secrets; falls back to the debug build until they're set) plus the AAB Google Play requires; removed the unused @capacitor/assets (npm audit: 0 critical, 0 high); every CI action pinned to a commit SHA; CodeQL scanning and Dependabot added, Dependabot alerts + automatic security-fix PRs switched on |
| 1.3.57  | Strict Content-Security-Policy: no inline script at all. The 2 inline &lt;script&gt; blocks moved to files (app.js, sw-register.js, buy.js) and every inline onclick/onkeydown became a data-on* attribute run by assets/actions.js against an allowlist of ~30 function names (no eval) — encrypted modules and translations are rewritten the same way just before insertion, with a MutationObserver as a safety net, so no ciphertext changed. Verified in a browser: real taps through nav/settings/text size, deep dives, answers, accordions, chat Enter/quick prompts all work; injected inline script and malicious handlers (alert, unknown functions, non-literal args) are refused. CI now injects the Groq key into assets/app.js |
| 1.3.58  | Fixed the 6 issues CodeQL's first scan flagged. Flashcards showed HTML entities literally (an answer with "F&B" displayed "F&amp;B") — answer text is now extracted by walking an inert DOM template instead of regex-stripping tags. Home-screen module cards now escape their titles/descriptions before inserting them as HTML. The two translation generators now hash with the same jsdom code the app and CI use instead of a regex approximation (verified 63/63 against shipped hashes). New "PR checks" workflow runs the tests, the translation guard and a real Android build on every pull request, so Dependabot's PRs are proven before merge |
| 1.3.59  | Backend for buyer accounts (backend/, Cloudflare Worker + D1 + R2, Firebase email/password sign-in) — built, tested, and **switched off** until deployed (backend-config.js apiBase: null keeps today's behaviour exactly). When on: Razorpay + Lemon Squeezy webhooks grant access automatically (HMAC-verified, idempotent, product decided by variant/amount — checkout fields can't upgrade a purchase), refunds revoke it, modules are served only to verified owners and watermarked per buyer, translations come from the API, and the AI coach goes through the Worker (key server-side, server-built prompt, daily limit). 19 backend tests (forged tokens/webhooks, tampering, prompt injection, limits) plus a full browser run of sign-up → verify → purchase → unlock → translate → AI → sign-out on a local harness. Runbook: backend/README.md |

Each new feature ship gets copied in here too, going forward.

Note: Android will refuse to install two of these side by side under the
same package ID — install one at a time to test it, or rename/uninstall
between installs.
