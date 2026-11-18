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
  15: ['100+ interview questions across 10 categories', 'STAR behavioral scenario bank', 'Live whiteboard design challenges', 'Mock rounds: recruiter, hiring manager, technical panel'],
  16: ['Timed mock interview sessions by track', 'Spaced-repetition flashcard practice', 'Self-paced review with due-today tracking', 'Progress synced with your dashboard']
};

// A short, curiosity-driving teaser paragraph for select modules' locked
// gates — deliberately not written for every module (that's what the
// "what's inside" topic list above is for); reserved for modules where a
// few persuasive lines of real hook copy earn their place above the fold.
window.MODULE_PREVIEW_HOOK = {
  1: "Why does MES exist at all — and why do consultants say \"15% OEE improvement\" with a straight face in front of a CFO? There are exactly three root problems that justify every MES investment ever made, a business-value framework that actually survives budget scrutiny, and one greenfield-vs-brownfield distinction most candidates get wrong in interviews. This module is where you stop reciting the wiki definition and start sounding like someone who's actually been in the room.",
  2: "Every MES interview eventually comes down to one whiteboard moment: can you draw the ISA-95 hierarchy from memory, cleanly, in under a minute — and then defend exactly where Level 3 ends and Level 4 begins when someone pushes back? This module is built entirely around that moment: the full five-level model with real field examples, and the standardize-vs-localize call that separates architects who've actually run a multi-site rollout from those who've only read about one.",
  3: "What actually happens, procedurally, when a batch gets put on hold mid-run — and how does the system know whether to resume, restart, or abort? ISA-88's state model is where most MES candidates go quiet, because it's rarely taught well. This module traces one product through all four recipe types end to end, and shows exactly how ISA-88's batch logic plugs into the ISA-95 hierarchy you already know — the connection interviewers specifically probe for.",
  4: "Work Order Management, OEE, Genealogy, Quality & SPC, Weigh & Dispense, Serialization, Scheduling, Recipe Management & Electronic Batch Records — most candidates can name a few of these. Almost none can explain, cleanly, what data each one owns and exactly which system it hands off to next. This module walks all eight, one at a time, in the same Purpose → Workflow → Data → Integration structure interviewers actually listen for.",
  5: "A pharma consultant and an automotive consultant will describe \"quality\" completely differently — and if you can't explain why in specific, concrete terms, an interviewer will know within thirty seconds that your MES knowledge is generic, not lived-in. This module gives you the real distinctions: pharma's deviation lifecycle, automotive's zero-defect traceability, F&B's catch-weight and allergen discipline, and semiconductor's SEMI standards — the vocabulary that proves you've actually worked across industries, not just one.",
  6: "The night before a real interview, you don't need more new material — you need the whole board compressed into a handful of diagrams you can replay in your head under pressure. This module is exactly that: every hierarchy, every integration map, every digital thread, redrawn as the mental images that actually stick when someone puts you on the spot.",
  7: "Anyone can list the technologies in an MES stack. What separates a Solutions Architect from a configurator is being able to defend a choice — Active-Active or Active-Passive, centralized or federated, event-driven or request-response — with real RTO/RPO numbers behind it. This module is the decision framework at every layer of the stack, not just the vocabulary.",
  8: "How do you move a live MES database to the cloud without ever stopping a 24/7 plant — and why does the migration strategy you pick alone determine whether you need a full IQ/OQ/PQ revalidation or just a lighter one? This module is the complete 6R framework plus the zero-downtime cutover mechanics most candidates have never actually had to execute.",
  9: "Ask a candidate \"is the Electronic Batch Record just a table?\" and watch how they answer — it's one of the fastest ways to tell a real data architect from someone who's only worked at the application layer. This module covers the genealogy graph model, the audit-trail design that actually satisfies 21 CFR Part 11, and the polyglot persistence reasoning behind when a plain relational database stops being enough.",
  10: "Most MES projects don't fail on the MES itself — they fail on the integration layer, usually because of master data that was never properly aligned before anyone wrote a line of code. This module is the complete integration knowledge base: ERP, SCADA/OPC-UA/PLC, LIMS, and Historian, each broken down to \"here's exactly what goes wrong, and here's how you catch it before it does.\"",
  11: "Unified Namespace, Digital Twin, GenAI in manufacturing — every job posting mentions these now, and most candidates have a vague, marketing-slide-level answer ready. This module gives you the actual architecture underneath each one, so when an interviewer pushes past the buzzword, you have somewhere real to go.",
  12: "\"We're exploring AI\" is not an answer. A real architect can explain exactly what data a predictive maintenance model needs, why label quality — not model choice — is usually the hard part, and what generative AI is and isn't ready to do in a regulated environment. This module is that level of depth, across every major AI use case in manufacturing, not just the two everyone already talks about.",
  13: "A go-live is scheduled for Friday, and Wednesday's SAT reveals a critical interface bug. What do you actually do? This module is the complete delivery methodology — discovery through hypercare — built around exactly the pressure-test scenarios real implementation leads get asked about, not just a generic project-phases diagram.",
  14: "The difference between a technical expert and a trusted advisor almost never shows up in the technology — it shows up in how you handle a stakeholder who goes quiet after you answer, or two functions in open conflict during your own workshop. This module is the human craft most MES training skips entirely, and exactly what senior interviewers are screening for once they're confident you know the technology.",
  15: "This isn't a flashcard deck — it's a live AI coach that role-plays as a Senior MES Architect interviewer, plus 100+ hand-written questions across ten categories: technical drills, STAR behavioral scenarios, live whiteboard challenges, and the exact questions recruiters, hiring managers, technical panels, and executives each ask differently. If Module 17's practice mode is where you rehearse, this is where you actually get interviewed.",
  16: "Knowing an answer and being able to produce it, cold, in twenty seconds under a stranger's gaze are two completely different skills — most candidates only ever practice the first one. This module is a real spaced-repetition system tuned to how you actually forget, plus timed mock rounds by track, so the questions you're shakiest on keep resurfacing until they're not."
};
