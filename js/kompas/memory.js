// Open Kompas — corrigeerbaar persoonlijk geheugen.
//
// Ontwerpregels (zie docs/open-kompas/ONTWERP.md):
//  • Vijf lagen: VERTELD, BELANGRIJK, INTERESSES, MOGELIJK (onbevestigd) en INZICHT (bevestigd).
//  • Archief: verouderd, gecorrigeerd en verwijderd — telt nooit mee in gesprekken of AI-context.
//  • Alleen de gebruiker kan een mogelijk verband bevestigen. NEXUS kan dat nooit zelf.
//  • Een mogelijk verband heeft altijd minstens één alternatieve verklaring (open houden).
//  • Onbevestigde verbanden verlopen vanzelf; bevestigde inzichten worden periodiek opnieuw getoetst.
//  • Verwijderen wist de inhoud echt (alleen een lege 'grafsteen' blijft, of niets bij 'purge').
//  • Alle functies zijn puur: ze geven een nieuw geheugen terug en muteren de invoer niet.

import { nowISO, addDaysISO, daysSince, defaultId, clone, signature } from './util.js';

export const MEMORY_SCHEMA = 1;

export const TYPES = Object.freeze({
  TOLD: 'told',         // iets wat de gebruiker zelf expliciet vertelde
  VALUE: 'value',       // iets wat de gebruiker belangrijk vindt
  INTEREST: 'interest', // iets waar de gebruiker nieuwsgierig naar is / plezier in heeft
  POSSIBLE: 'possible', // mogelijk verband, door NEXUS geopperd, NIET bevestigd
  INSIGHT: 'insight',   // inzicht dat de gebruiker zelf heeft bevestigd of geformuleerd
});

export const STATUS = Object.freeze({
  ACTIVE: 'active',
  OUTDATED: 'outdated',   // klopte ooit, nu niet meer relevant
  CORRECTED: 'corrected', // gebruiker gaf aan dat het niet (meer) klopt
  DELETED: 'deleted',     // inhoud gewist
});

export const LAYER_LABELS = Object.freeze({
  told: 'Wat je me vertelde',
  value: 'Wat je belangrijk vindt',
  interest: 'Waar je nieuwsgierig naar bent',
  possible: 'Mogelijke verbanden (onbevestigd)',
  insight: 'Inzichten die jij bevestigde',
  archive: 'Archief: verouderd, gecorrigeerd of verwijderd',
});

/** Na hoeveel dagen NEXUS mag vragen of iets nog klopt. */
export const REVIEW_DAYS = Object.freeze({ told: 180, value: 120, interest: 90, possible: 14, insight: 60 });
/** Onbevestigde verbanden vervallen automatisch na zoveel dagen. */
export const POSSIBLE_EXPIRY_DAYS = 30;
/** Hoe lang een afgewezen/overgeslagen verband niet opnieuw geopperd mag worden. */
export const REJECT_COOLDOWN_DAYS = 365;
export const SKIP_COOLDOWN_DAYS = 21;

const USER = 'user';
const NEXUS = 'nexus';

export function createMemory({ now } = {}) {
  return { schema: MEMORY_SCHEMA, createdAt: nowISO(now), entries: [], suppressed: [] };
}

function produce(memory, fn) {
  const next = clone(memory);
  fn(next);
  return next;
}

function findEntry(memory, id) {
  const e = memory.entries.find((x) => x.id === id);
  if (!e) throw new Error(`Kompas: onbekend item ${id}`);
  return e;
}

function cleanText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('Kompas: lege tekst');
  if (t.length > 500) throw new Error('Kompas: tekst te lang (max 500 tekens)');
  return t;
}

function cleanTopics(topics) {
  return [...new Set((topics || []).map(String).filter(Boolean))].slice(0, 8);
}

function baseEntry(type, text, origin, opts) {
  const at = nowISO(opts.now);
  return {
    id: (opts.idGen || defaultId)('mem'),
    type,
    text: cleanText(text),
    origin,
    status: STATUS.ACTIVE,
    topics: cleanTopics(opts.topics),
    createdAt: at,
    updatedAt: at,
    lastConfirmedAt: origin === USER ? at : null,
    reviewAfter: addDaysISO(at, REVIEW_DAYS[type]),
    history: [{ at, action: 'created', by: origin }],
  };
}

// ---------------------------------------------------------------------------
// Toevoegen — alleen na expliciete keuze van de gebruiker (de UI vraagt "Onthouden?").
// ---------------------------------------------------------------------------

/** Iets wat de gebruiker zelf vertelde, in de eigen woorden. */
export function addTold(memory, text, opts = {}) {
  return produce(memory, (m) => { m.entries.push(baseEntry(TYPES.TOLD, text, USER, opts)); });
}
export function addValue(memory, text, opts = {}) {
  return produce(memory, (m) => { m.entries.push(baseEntry(TYPES.VALUE, text, USER, opts)); });
}
export function addInterest(memory, text, opts = {}) {
  return produce(memory, (m) => { m.entries.push(baseEntry(TYPES.INTEREST, text, USER, opts)); });
}
/** De gebruiker formuleert zelf een inzicht — telt direct als bevestigd. */
export function addOwnInsight(memory, text, opts = {}) {
  return produce(memory, (m) => { m.entries.push(baseEntry(TYPES.INSIGHT, text, USER, opts)); });
}

/**
 * NEXUS bewaart een mogelijk verband — alleen als de gebruiker "misschien, bewaar maar" koos.
 * Er moet altijd minstens één alternatieve verklaring bij; zonder alternatief voegen we
 * standaard toe dat het ook heel anders kan zitten.
 */
export function addPossible(memory, text, opts = {}) {
  if (isSuppressed(memory, text, opts)) throw new Error('Kompas: dit verband is eerder afgewezen of overgeslagen');
  return produce(memory, (m) => {
    const e = baseEntry(TYPES.POSSIBLE, text, NEXUS, opts);
    const alts = (opts.alternatives || []).map((a) => String(a).trim()).filter(Boolean);
    e.alternatives = alts.length ? alts.slice(0, 4) : ['Het kan ook heel anders zitten — jij weet dat het beste.'];
    e.evidence = (opts.evidence || []).slice(0, 10); // verwijzingen naar gespreksbeurten, geen kopieën
    e.expiresAt = addDaysISO(e.createdAt, POSSIBLE_EXPIRY_DAYS);
    m.entries.push(e);
  });
}

// ---------------------------------------------------------------------------
// Regie van de gebruiker
// ---------------------------------------------------------------------------

function assertUser(by) {
  if (by !== USER) throw new Error('Kompas: alleen de gebruiker kan dit doen');
}

/** Gebruiker bevestigt een mogelijk verband → wordt een inzicht. Eventueel in eigen woorden. */
export function confirm(memory, id, { by, text, now } = {}) {
  assertUser(by);
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    if (e.status !== STATUS.ACTIVE) throw new Error('Kompas: alleen actieve items kunnen bevestigd worden');
    const at = nowISO(now);
    if (e.type === TYPES.POSSIBLE) {
      e.history.push({ at, action: 'confirmed', by: USER, from: e.text });
      e.type = TYPES.INSIGHT;
      delete e.expiresAt;
    } else {
      e.history.push({ at, action: 'reaffirmed', by: USER });
    }
    if (text) e.text = cleanText(text);
    e.lastConfirmedAt = at;
    e.updatedAt = at;
    e.reviewAfter = addDaysISO(at, REVIEW_DAYS[e.type]);
  });
}

/** "Klopt nog steeds" bij een herijkingsvraag. */
export const reaffirm = (memory, id, opts = {}) => confirm(memory, id, opts);

/**
 * Gebruiker zegt "dit klopt niet". Het item gaat naar het archief en NEXUS mag het
 * (of iets vrijwel gelijks) niet opnieuw opperen. Een eigen correctie wordt als
 * nieuw VERTELD-item bewaard — in de woorden van de gebruiker.
 */
export function correct(memory, id, { by, correction, now, idGen } = {}) {
  assertUser(by);
  let next = produce(memory, (m) => {
    const e = findEntry(m, id);
    const at = nowISO(now);
    e.status = STATUS.CORRECTED;
    e.updatedAt = at;
    e.history.push({ at, action: 'corrected', by: USER });
    if (e.origin === NEXUS) suppress(m, e.text, at, REJECT_COOLDOWN_DAYS, 'rejected');
  });
  if (correction && String(correction).trim()) {
    const old = memory.entries.find((x) => x.id === id);
    next = addTold(next, correction, { now, idGen, topics: old?.topics });
  }
  return next;
}

export function markOutdated(memory, id, { by, now } = {}) {
  assertUser(by);
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    const at = nowISO(now);
    e.status = STATUS.OUTDATED;
    e.updatedAt = at;
    e.history.push({ at, action: 'outdated', by: USER });
  });
}

/** Terughalen uit het archief (niet voor verwijderde items: die inhoud bestaat niet meer). */
export function restore(memory, id, { by, now } = {}) {
  assertUser(by);
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    if (e.status === STATUS.DELETED) throw new Error('Kompas: verwijderde items zijn niet terug te halen');
    const at = nowISO(now);
    e.status = STATUS.ACTIVE;
    e.updatedAt = at;
    e.history.push({ at, action: 'restored', by: USER });
    if (e.type === TYPES.POSSIBLE) e.expiresAt = addDaysISO(at, POSSIBLE_EXPIRY_DAYS);
  });
}

/** Gebruiker past de tekst aan. Een bewerkt verband blijft onbevestigd tot de gebruiker het bevestigt. */
export function edit(memory, id, { by, text, topics, now } = {}) {
  assertUser(by);
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    if (e.status === STATUS.DELETED) throw new Error('Kompas: verwijderd item');
    const at = nowISO(now);
    e.history.push({ at, action: 'edited', by: USER });
    e.text = cleanText(text);
    if (topics) e.topics = cleanTopics(topics);
    e.updatedAt = at;
  });
}

/** Wis de inhoud; er blijft alleen een lege grafsteen over (zodat een sync weet dat het weg moet). */
export function remove(memory, id, { by, now } = {}) {
  assertUser(by);
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    const at = nowISO(now);
    if (e.origin === NEXUS && e.status === STATUS.ACTIVE) suppress(m, e.text, at, REJECT_COOLDOWN_DAYS, 'rejected');
    const tomb = { id: e.id, type: e.type, origin: e.origin, status: STATUS.DELETED, createdAt: e.createdAt, updatedAt: at, deletedAt: at };
    Object.keys(e).forEach((k) => delete e[k]);
    Object.assign(e, tomb);
  });
}

/** Volledig verwijderen, ook de grafsteen. */
export function purge(memory, id, { by } = {}) {
  assertUser(by);
  return produce(memory, (m) => { m.entries = m.entries.filter((e) => e.id !== id); });
}

/** Alles wissen — volledige regie. */
export function wipeAll(memory, { by, now } = {}) {
  assertUser(by);
  return createMemory({ now });
}

// ---------------------------------------------------------------------------
// Onderdrukken van afgewezen of overgeslagen verbanden
// ---------------------------------------------------------------------------

function suppress(m, text, at, days, reason) {
  const sig = signature(text);
  if (!sig) return;
  m.suppressed = (m.suppressed || []).filter((s) => s.sig !== sig);
  m.suppressed.push({ sig, until: addDaysISO(at, days), reason });
}

/** Gebruiker sloeg een voorgesteld verband over: een tijd niet opnieuw opperen. */
export function noteSkippedPossible(memory, text, { now } = {}) {
  return produce(memory, (m) => suppress(m, text, nowISO(now), SKIP_COOLDOWN_DAYS, 'skipped'));
}

/** Gebruiker wees een voorgesteld verband af dat nog niet bewaard was. */
export function noteRejectedPossible(memory, text, { now } = {}) {
  return produce(memory, (m) => suppress(m, text, nowISO(now), REJECT_COOLDOWN_DAYS, 'rejected'));
}

/** Overlap ≥ 70% van de betekenisvolle woorden telt als "hetzelfde verband". */
export function isSuppressed(memory, text, { now } = {}) {
  const at = nowISO(now);
  const words = new Set(signature(text).split('|').filter(Boolean));
  if (!words.size) return false;
  return (memory.suppressed || []).some((s) => {
    if (Date.parse(s.until) <= Date.parse(at)) return false;
    const other = s.sig.split('|').filter(Boolean);
    const shared = other.filter((w) => words.has(w)).length;
    return shared / Math.max(words.size, other.length) >= 0.7;
  });
}

// ---------------------------------------------------------------------------
// Onderhoud: laat oude aannames niet sturen
// ---------------------------------------------------------------------------

/** Laat onbevestigde verbanden na de vervaltermijn automatisch verouderen. */
export function expireStale(memory, { now } = {}) {
  const at = nowISO(now);
  return produce(memory, (m) => {
    for (const e of m.entries) {
      if (e.type === TYPES.POSSIBLE && e.status === STATUS.ACTIVE && e.expiresAt && Date.parse(e.expiresAt) <= Date.parse(at)) {
        e.status = STATUS.OUTDATED;
        e.updatedAt = at;
        e.history.push({ at, action: 'expired', by: NEXUS });
      }
    }
    m.suppressed = (m.suppressed || []).filter((s) => Date.parse(s.until) > Date.parse(at));
  });
}

/** Items waarvan het tijd is om te vragen of ze nog kloppen (oudste eerst). */
export function dueForReview(memory, { now } = {}) {
  const at = Date.parse(nowISO(now));
  return active(memory)
    .filter((e) => e.reviewAfter && Date.parse(e.reviewAfter) <= at)
    .sort((a, b) => a.reviewAfter.localeCompare(b.reviewAfter));
}

/** Gebruiker wil niet nu kijken: schuif de herijking op zonder iets te veranderen. */
export function postponeReview(memory, id, { days = 30, now } = {}) {
  return produce(memory, (m) => {
    const e = findEntry(m, id);
    e.reviewAfter = addDaysISO(nowISO(now), days);
  });
}

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

export const active = (memory) => memory.entries.filter((e) => e.status === STATUS.ACTIVE);
export const archived = (memory) => memory.entries.filter((e) => e.status !== STATUS.ACTIVE);
export const isFact = (e) => e.status === STATUS.ACTIVE && e.type !== TYPES.POSSIBLE;
export const isUnconfirmed = (e) => e.type === TYPES.POSSIBLE;

/** Overzicht per laag, voor het scherm "Mijn Kompas". */
export function layers(memory) {
  const out = { told: [], value: [], interest: [], possible: [], insight: [], archive: [] };
  for (const e of memory.entries) (e.status === STATUS.ACTIVE ? out[e.type] : out.archive).push(e);
  return out;
}

/** Leeftijd in dagen sinds laatste bevestiging door de gebruiker (of aanmaak). */
export function ageDays(entry, { now } = {}) {
  return daysSince(entry.lastConfirmedAt || entry.createdAt, nowISO(now));
}

// ---------------------------------------------------------------------------
// (De)serialisatie — klaar voor een versleutelde opslag-adapter uit P0
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(Object.values(TYPES));
const VALID_STATUS = new Set(Object.values(STATUS));

export function validate(memory) {
  const errors = [];
  if (!memory || typeof memory !== 'object') return ['geen object'];
  if (memory.schema !== MEMORY_SCHEMA) errors.push(`onbekend schema ${memory.schema}`);
  if (!Array.isArray(memory.entries)) errors.push('entries ontbreekt');
  const ids = new Set();
  for (const e of memory.entries || []) {
    if (!e.id || ids.has(e.id)) errors.push(`dubbel of leeg id ${e.id}`);
    ids.add(e.id);
    if (!VALID_TYPES.has(e.type)) errors.push(`${e.id}: onbekend type ${e.type}`);
    if (!VALID_STATUS.has(e.status)) errors.push(`${e.id}: onbekende status ${e.status}`);
    if (e.status === STATUS.DELETED && 'text' in e) errors.push(`${e.id}: verwijderd item bevat nog tekst`);
    if (e.type === TYPES.POSSIBLE && e.origin !== NEXUS) errors.push(`${e.id}: mogelijk verband moet van NEXUS komen`);
    if (e.type === TYPES.POSSIBLE && e.status === STATUS.ACTIVE && !(e.alternatives || []).length) errors.push(`${e.id}: mogelijk verband zonder alternatief`);
    if (e.type === TYPES.INSIGHT && e.status !== STATUS.DELETED && !e.lastConfirmedAt) errors.push(`${e.id}: inzicht zonder bevestiging door gebruiker`);
  }
  return errors;
}

export function serialize(memory) {
  return JSON.stringify(memory);
}

export function deserialize(json) {
  const m = typeof json === 'string' ? JSON.parse(json) : json;
  const errors = validate(m);
  if (errors.length) throw new Error(`Kompas: ongeldig geheugen — ${errors.join('; ')}`);
  return m;
}
