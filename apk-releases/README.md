# APK release archive

Local-only archive of each shipped APK, kept so you can install and compare
functionality across versions side by side. Not tracked in git (`*.apk` is
gitignored) — this folder lives only on this machine.

Naming: `MES-Architect-v<version>-<feature>.apk`

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

Each new feature ship gets copied in here too, going forward.

Note: Android will refuse to install two of these side by side under the
same package ID — install one at a time to test it, or rename/uninstall
between installs.
