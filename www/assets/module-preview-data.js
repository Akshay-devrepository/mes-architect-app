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
window.MODULE_PREVIEW_TOPICS = {
  1: ['Visual 5-level hierarchy diagram', 'ISA-95 object models & levels', 'The Level 3/4 boundary, worked example', 'Resource models with real field examples', 'Multi-site rollout: standardize vs localize'],
  2: ['Physical & procedural models', 'All 4 recipe types, traced through one product', 'The state model: holds, restarts & exceptions', 'How ISA-88 connects to ISA-95'],
  3: ['Visual production-order flow diagram', 'All 15+ MES functional modules', 'Purpose, workflow & data for each', 'Integration points between modules', 'Interview-ready module explanations'],
  4: ['Enterprise tech stack decision guide', 'HA/DR design patterns & RTO/RPO targets', 'Multi-site architecture governance', 'Edge computing & event-driven design'],
  5: ['Migration readiness & the 6R framework', 'Cloud platform selection (Azure/AWS)', 'Zero-downtime data migration', 'GxP re-validation & cutover execution'],
  6: ['Visual genealogy/traceability tree', 'Polyglot persistence strategy', 'ISA-95-aligned entity data models', '21 CFR Part 11 audit trail design', 'Electronic Batch Record (EBR) data model'],
  7: ['39 interview questions across 6 categories', 'STAR behavioral scenario bank', 'Live whiteboard design challenges', 'Mock rounds: recruiter, hiring manager, technical panel'],
  8: ['Discovery & requirements gathering', 'Configure-vs-customize decisions', 'Validation lifecycle (FAT/SAT/IQ/OQ/PQ)', 'Go-live, cutover & hypercare'],
  9: ['Pharma GxP & the deviation lifecycle', 'Automotive zero-defect traceability', 'F&B allergen & catch-weight discipline', 'Semiconductor SEMI standards'],
  10: ['30-day foundation sprint', '90-day architect-level plan', '6-month complete roadmap', 'Milestones & mock interview checkpoints'],
  11: ['ISA-95/88 visual hierarchy trees', 'MES integration architecture map', 'Digital thread & digital twin flow', '3 real scenarios traced across every domain'],
  12: ['Business-first problem framing', 'Stakeholder communication matrix', 'Workshop facilitation playbook', 'Objection handling & client psychology'],
  13: ['Unified Namespace & MQTT Sparkplug B', 'AI & GenAI in manufacturing', 'Digital twin architecture', 'Manufacturing data fabric'],
  14: ['Visual integration hub diagram', 'MES ↔ ERP integration deep dive', 'MES ↔ SCADA/OPC-UA/PLC deep dive', 'MES ↔ LIMS integration deep dive', 'MES ↔ Historian integration deep dive'],
  15: ['Computer vision quality inspection', 'Predictive maintenance architecture', 'AI-driven production scheduling', 'Conversational & agentic AI in MES'],
  16: ['Timed mock interview sessions by track', 'Spaced-repetition flashcard practice', 'Self-paced review with due-today tracking', 'Progress synced with your dashboard']
};
