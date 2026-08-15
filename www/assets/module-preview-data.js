// ══════════════════════════════════════════
// MODULE-PREVIEW-DATA.JS — a short, genuine topic list per locked module,
// shown on its locked-gate screen as a "what's inside" teaser before
// purchase. Deliberately kept as a separate, always-plaintext file rather
// than baked into encrypt-modules.js, so it can be edited without ever
// touching the encryption pipeline or re-running that script.
//
// Written from the real headings inside each module (decrypted once for
// this purpose, then re-encrypted — this file only ever holds short
// topic phrases, never full module content).
// ══════════════════════════════════════════
// Keys are 0-indexed section numbers (sec-N) — module 0 (Learning Roadmap)
// is free and has no locked gate, so it has no entry here.
window.MODULE_PREVIEW_TOPICS = {
  1: ['What MES is & why it exists — the three root problems', 'MES evolution: scheduling board to AI-driven digital twin', 'Business value & ROI benchmarks, with calculation method', 'Greenfield vs brownfield deployment trade-offs'],
  2: ['Visual 5-level hierarchy diagram', 'ISA-95 object models & levels', 'The Level 3/4 boundary, worked example', 'Resource models with real field examples', 'Multi-site rollout: standardize vs localize'],
  3: ['Physical & procedural models', 'All 4 recipe types, traced through one product', 'The state model: holds, restarts & exceptions', 'How ISA-88 connects to ISA-95'],
  4: ['Visual production-order flow diagram', 'All 15+ MES functional modules', 'Purpose, workflow & data for each', 'Integration points between modules', 'Interview-ready module explanations'],
  5: ['Pharma GxP & the deviation lifecycle', 'Automotive zero-defect traceability', 'F&B allergen & catch-weight discipline', 'Semiconductor SEMI standards'],
  6: ['ISA-95/88 visual hierarchy trees', 'MES integration architecture map', 'Digital thread & digital twin flow', '3 real scenarios traced across every domain'],
  7: ['Enterprise tech stack decision guide', 'HA/DR design patterns & RTO/RPO targets', 'Multi-site architecture governance', 'Edge computing & event-driven design'],
  8: ['Migration readiness & the 6R framework', 'Cloud platform selection (Azure/AWS)', 'Zero-downtime data migration', 'GxP re-validation & cutover execution'],
  9: ['Visual genealogy/traceability tree', 'Polyglot persistence strategy', 'ISA-95-aligned entity data models', '21 CFR Part 11 audit trail design', 'Electronic Batch Record (EBR) data model'],
  10: ['Visual integration hub diagram', 'MES ↔ ERP integration deep dive', 'MES ↔ SCADA/OPC-UA/PLC deep dive', 'MES ↔ LIMS integration deep dive', 'MES ↔ Historian integration deep dive'],
  11: ['Unified Namespace & MQTT Sparkplug B', 'AI & GenAI in manufacturing', 'Digital twin architecture', 'Manufacturing data fabric'],
  12: ['Computer vision quality inspection', 'Predictive maintenance architecture', 'AI-driven production scheduling', 'Conversational & agentic AI in MES'],
  13: ['Discovery & requirements gathering', 'Configure-vs-customize decisions', 'Validation lifecycle (FAT/SAT/IQ/OQ/PQ)', 'Go-live, cutover & hypercare'],
  14: ['Business-first problem framing', 'Stakeholder communication matrix', 'Workshop facilitation playbook', 'Objection handling & client psychology'],
  15: ['39 interview questions across 6 categories', 'STAR behavioral scenario bank', 'Live whiteboard design challenges', 'Mock rounds: recruiter, hiring manager, technical panel'],
  16: ['Timed mock interview sessions by track', 'Spaced-repetition flashcard practice', 'Self-paced review with due-today tracking', 'Progress synced with your dashboard']
};

// A short, curiosity-driving teaser paragraph for select modules' locked
// gates — deliberately not written for every module (that's what the
// "what's inside" topic list above is for); reserved for modules where a
// few persuasive lines of real hook copy earn their place above the fold.
window.MODULE_PREVIEW_HOOK = {
  1: "Why does MES exist at all — and why do consultants say \"15% OEE improvement\" with a straight face in front of a CFO? There are exactly three root problems that justify every MES investment ever made, a business-value framework that actually survives budget scrutiny, and one greenfield-vs-brownfield distinction most candidates get wrong in interviews. This module is where you stop reciting the wiki definition and start sounding like someone who's actually been in the room."
};
