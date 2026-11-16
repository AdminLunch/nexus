// Open Kompas — publieke ingang van de module (NEXUS v1.4).
// Zelfstandig: importeert niets uit store.js, app.js of js/ai/. Geen DOM, opslag of netwerk.
export * as memory from './memory.js';
export * as guards from './guards.js';
export * as topics from './topics.js';
export * as toolbox from './toolbox.js';
export { startSession, respond, CORE_ACTIONS, ANGLES, OPEN_DOORS } from './conversation.js';
export { KOMPAS_RULES, buildTurnMessages, parseJson, checkTurn, choiceText } from './aiturn.js';
export { buildKompasContext, OPEN_KOMPAS_RULES, REQUIRED_CONSENT_SCOPES } from './context.js';
export { createInMemoryAdapter, createKompasRepository, applyOps, proposalToOp } from './storage.js';
