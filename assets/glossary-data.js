// ══════════════════════════════════════════
// GLOSSARY-DATA.JS — terms/acronyms referenced across the board's 16
// modules. Kept as a flat, hand-curated array (not scanned from the DOM
// like the quiz deck) since a glossary benefits from a clean, deliberate
// definition rather than whatever phrasing happens to appear in context.
// ══════════════════════════════════════════

window.GLOSSARY_DATA = [
  // ── Standards & Frameworks ──
  { term: 'MES', expansion: 'Manufacturing Execution System', category: 'Core', definition: 'The software layer that manages and monitors work-in-process on the factory floor, sitting between ERP (business planning) and control systems (PLC/SCADA), turning a production schedule into verified, real-time execution.' },
  { term: 'MOM', expansion: 'Manufacturing Operations Management', category: 'Core', definition: 'The broader ISA-95 term covering production, quality, maintenance, and inventory operations management as a group of related functions, of which MES is often the software backbone.' },
  { term: 'ISA-95', expansion: 'IEC/ISO 62264', category: 'Standards', definition: 'The international standard for integrating enterprise (ERP) and control (SCADA/PLC) systems — defines the 5-level hierarchy and standard data models used to exchange production, quality, and maintenance information between them.' },
  { term: 'ISA-88', expansion: 'IEC 61512', category: 'Standards', definition: 'The international standard for batch process control, defining physical models (equipment hierarchy) and procedural models (recipes) — foundational in pharma, chemical, and food/beverage manufacturing.' },
  { term: 'Purdue Model', expansion: 'Purdue Enterprise Reference Architecture', category: 'Standards', definition: 'A reference model (predates and heavily influenced ISA-95) dividing industrial systems into layers from the physical process up to enterprise IT — commonly used to reason about network segmentation and OT/IT boundaries.' },
  { term: 'B2MML', expansion: 'Business To Manufacturing Markup Language', category: 'Standards', definition: 'An XML implementation of the ISA-95 data models, used to exchange schedules, production performance, and other data between ERP and MES systems.' },

  // ── Architecture Levels (ISA-95 / Purdue) ──
  { term: 'Level 0', expansion: null, category: 'Architecture', definition: 'The physical production process itself — the actual sensors and actuators acting on the physical product.' },
  { term: 'Level 1', expansion: 'Basic Control', category: 'Architecture', definition: 'PLCs and sensors directly controlling equipment — reading a sensor, actuating a valve, executing logic in real time.' },
  { term: 'Level 2', expansion: 'Supervisory Control', category: 'Architecture', definition: 'SCADA and HMI systems providing local monitoring and control of a work cell or process area.' },
  { term: 'Level 3', expansion: 'Manufacturing Operations Management', category: 'Architecture', definition: 'MES and related systems managing production, quality, maintenance, and inventory in real time across a site.' },
  { term: 'Level 4', expansion: 'Business Planning & Logistics', category: 'Architecture', definition: 'ERP and other business systems handling scheduling, ordering, shipping, and high-level planning.' },

  // ── Protocols & Connectivity ──
  { term: 'OPC UA', expansion: 'Open Platform Communications Unified Architecture', category: 'Protocols', definition: 'A platform-independent, secure industrial communication protocol for exchanging data between machines, SCADA, and MES/IT systems — the de facto standard for modern Industry 4.0 connectivity.' },
  { term: 'MQTT', expansion: 'Message Queuing Telemetry Transport', category: 'Protocols', definition: 'A lightweight publish/subscribe messaging protocol designed for constrained devices and low-bandwidth networks, widely used in IIoT for streaming sensor data.' },
  { term: 'UNS', expansion: 'Unified Namespace', category: 'Protocols', definition: 'An architectural pattern — not a product — where all plant/enterprise data is published to a single, hierarchically-organized, event-driven data backbone (often MQTT-based) that any system can subscribe to, replacing point-to-point integrations.' },
  { term: 'SCADA', expansion: 'Supervisory Control and Data Acquisition', category: 'Protocols', definition: 'Systems for real-time monitoring and control of industrial processes across a site or region, sitting above PLCs and below MES in the hierarchy.' },
  { term: 'PLC', expansion: 'Programmable Logic Controller', category: 'Protocols', definition: 'A ruggedized industrial computer that directly controls machinery or processes via I/O, typically executing ladder logic in real time.' },
  { term: 'HMI', expansion: 'Human-Machine Interface', category: 'Protocols', definition: 'The screen or interface operators use to monitor and interact with a machine or process, typically connected to a PLC or SCADA system.' },
  { term: 'DCS', expansion: 'Distributed Control System', category: 'Protocols', definition: 'A control system architecture for continuous processes (common in refining/chemicals) where control is distributed across many controllers rather than centralized — contrasted with PLC-based discrete control.' },

  // ── Quality & Compliance ──
  { term: 'SPC', expansion: 'Statistical Process Control', category: 'Quality', definition: 'Using control charts and statistical methods to monitor a process in real time, distinguishing normal variation from special-cause variation that needs investigation.' },
  { term: 'EBR', expansion: 'Electronic Batch Record', category: 'Quality', definition: 'A digital replacement for paper batch/production records, capturing every step, parameter, and signature for a manufactured batch — critical in regulated industries like pharma and food.' },
  { term: 'CAPA', expansion: 'Corrective and Preventive Action', category: 'Quality', definition: 'A structured quality process for investigating a nonconformance: fixing the immediate issue (corrective) and preventing recurrence (preventive) — foundational to any regulated quality system.' },
  { term: 'Genealogy / Traceability', expansion: null, category: 'Quality', definition: "The ability to trace a finished product's full history — which raw material lots, equipment, operators, and process parameters went into it — usually both forwards and backwards through the supply chain." },
  { term: 'Non-Conformance', expansion: 'NC', category: 'Quality', definition: "A recorded instance where a product, process, or material doesn't meet its specification, typically triggering an investigation and possibly a CAPA." },
  { term: 'Deviation', expansion: null, category: 'Quality', definition: 'A documented departure from an approved procedure or specification during production — common terminology in pharma/regulated manufacturing, usually requiring investigation before batch release.' },
  { term: 'QMS', expansion: 'Quality Management System', category: 'Quality', definition: 'The overarching system — people, processes, software — governing how an organization manages and improves quality, of which CAPA/NC/deviation processes are typically a part.' },
  { term: 'LIMS', expansion: 'Laboratory Information Management System', category: 'Quality', definition: 'Software that manages lab samples, testing workflows, and quality-control results, often integrated with MES for batch release decisions.' },

  // ── Production & Scheduling ──
  { term: 'OEE', expansion: 'Overall Equipment Effectiveness', category: 'Production', definition: 'A composite metric — Availability × Performance × Quality — measuring how effectively a piece of equipment is used compared to its full potential.' },
  { term: 'APS', expansion: 'Advanced Planning and Scheduling', category: 'Production', definition: "Software that optimizes production schedules against real constraints (capacity, materials, changeovers) — more sophisticated than a basic ERP's scheduling module." },
  { term: 'BOM', expansion: 'Bill of Materials', category: 'Production', definition: 'The structured list of raw materials, components, and sub-assemblies (and their quantities) required to build a finished product.' },
  { term: 'Work Order', expansion: null, category: 'Production', definition: 'An instruction to produce a specific quantity of a product — often the trigger that MES executes on the shop floor.' },
  { term: 'Recipe', expansion: 'ISA-88', category: 'Production', definition: 'A set of instructions, parameters, and equipment requirements needed to manufacture a batch, structured hierarchically (general / site / master / control recipe) per ISA-88.' },
  { term: 'WIP', expansion: 'Work In Process', category: 'Production', definition: 'Partially completed goods currently in production — not yet finished product, no longer raw material.' },
  { term: 'Changeover', expansion: null, category: 'Production', definition: 'The process of reconfiguring a production line from making one product or variant to another — a major source of downtime that OEE and lean programs specifically target for reduction.' },
  { term: 'Andon', expansion: null, category: 'Production', definition: 'A visual or audible signal (often a light or alert) used to flag a problem on the production line, originating from the Toyota Production System.' },
  { term: 'Kanban', expansion: null, category: 'Production', definition: 'A pull-based scheduling signal (physical card or digital equivalent) that triggers replenishment or the next production step only when needed, reducing overproduction and excess inventory.' },

  // ── Data, Analytics & IIoT ──
  { term: 'Historian', expansion: 'Data Historian', category: 'Data & IIoT', definition: 'A specialized time-series database that captures and stores high-frequency process/sensor data over long periods, used for trending, analysis, and compliance.' },
  { term: 'Digital Twin', expansion: null, category: 'Data & IIoT', definition: 'A virtual, data-driven representation of a physical asset, process, or system that mirrors its real-world counterpart in near-real time — used for simulation, monitoring, or optimization.' },
  { term: 'ERP', expansion: 'Enterprise Resource Planning', category: 'Data & IIoT', definition: 'Business software managing finance, procurement, and high-level planning — sits above MES at ISA-95 Level 4.' },
  { term: 'IIoT', expansion: 'Industrial Internet of Things', category: 'Data & IIoT', definition: 'The application of internet-connected sensors, devices, and analytics to industrial equipment and processes — a core building block of Industry 4.0.' },
  { term: 'Industry 4.0', expansion: null, category: 'Data & IIoT', definition: 'The ongoing shift toward highly connected, data-driven, and increasingly autonomous manufacturing, combining IIoT, cloud/edge computing, AI/analytics, and cyber-physical systems.' },
  { term: 'Edge Computing', expansion: null, category: 'Data & IIoT', definition: 'Processing data physically close to where it is generated (on the plant floor) rather than sending everything to a distant data center or cloud — reduces latency and bandwidth needs.' },
  { term: 'OT/IT Convergence', expansion: null, category: 'Data & IIoT', definition: 'The trend of operational technology (control systems, historians) and information technology (enterprise IT, cloud) increasingly sharing infrastructure, data, and security practices, once kept strictly separate.' },

  // ── MES Vendors/Products referenced in this app ──
  { term: 'Hydra X', expansion: null, category: 'Vendors', definition: 'An MES platform (by MPDV) widely used in discrete/automotive manufacturing for production data collection, machine data, and shop-floor control.' },
  { term: 'SAP Digital Manufacturing', expansion: 'SAP DM', category: 'Vendors', definition: "SAP's cloud-based MES/MOM offering, integrating manufacturing execution with the broader SAP ERP/S4HANA ecosystem." },
  { term: 'Siemens Opcenter', expansion: null, category: 'Vendors', definition: "Siemens' MES/MOM software suite (formerly Camstar/SIMATIC IT), covering execution, quality, and scheduling across multiple industries." },
  { term: 'Apriso', expansion: null, category: 'Vendors', definition: 'A MOM/MES platform (owned by Dassault Systèmes/DELMIA) known for standardized manufacturing operations across global, multi-site enterprises.' }
];
