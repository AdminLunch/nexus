// Open Kompas — geminimaliseerde context voor een toekomstige (beveiligde) AI-laag.
//
// Er wordt hier GEEN AI aangeroepen. Deze functie bepaalt alleen wát er na P0 aan een
// AI-provider meegegeven mag worden, en hoe: feiten en onbevestigde verbanden strikt
// gescheiden, archief en verwijderde items nooit, en de Open Kompas-regels altijd erbij.
// De toestemming (consent) zelf wordt door P0 geregeld; wij declareren alleen de scope.

import { nowISO } from './util.js';
import { active, TYPES } from './memory.js';

export const KOMPAS_CONTEXT_VERSION = 1;
export const REQUIRED_CONSENT_SCOPES = Object.freeze(['kompas.memory.read']);

export const OPEN_KOMPAS_RULES = Object.freeze([
  'Plaats de gebruiker niet in een categorie of persoonlijkheidstype en stel geen diagnose.',
  'Behandel items onder "openPossibilities" nooit als feit; formuleer ze als vraag en noem een alternatief.',
  'Eerdere inzichten mogen als voorlopige context dienen om verbanden te ontdekken en persoonlijkere suggesties te doen, maar nooit leiden tot vaste conclusies, diagnoses of beperking van nieuwe mogelijkheden. Heroverweeg ze actief en volg wat de gebruiker nu aandraagt.',
  'Interpreteer praktische vragen, hobby’s en plezier niet psychologisch.',
  'Vraag niet naar doelen tenzij de gebruiker er zelf over begint; "weet ik niet" is een prima antwoord.',
  'Bied oefeningen (ACT, CGT, journaling) alleen vrijblijvend aan.',
  'De gebruiker kan altijd: doorgaan, andere invalshoek, ander onderwerp, praktisch, overslaan, "klopt niet".',
]);

const MAX_ITEMS_PER_LAYER = 12;
const MAX_TEXT = 200;

const slim = (e) => ({ text: e.text.slice(0, MAX_TEXT), topics: e.topics });

/**
 * @param {object} memory
 * @param {{now?: any, topics?: string[], includePossibilities?: boolean}} [opts]
 *   topics: beperk tot items die raken aan het huidige onderwerp (dataminimalisatie).
 */
export function buildKompasContext(memory, { now, topics = null, includePossibilities = true } = {}) {
  const at = nowISO(now);
  const relevant = (e) => !topics || !topics.length || e.topics.some((t) => topics.includes(t)) || e.type === TYPES.VALUE;
  const live = active(memory).filter(relevant);
  const of = (type) => live.filter((e) => e.type === type).slice(-MAX_ITEMS_PER_LAYER).map(slim);
  const possibilities = includePossibilities
    ? live.filter((e) => e.type === TYPES.POSSIBLE && (!e.expiresAt || Date.parse(e.expiresAt) > Date.parse(at)))
      .slice(-MAX_ITEMS_PER_LAYER)
      .map((e) => ({ ...slim(e), status: 'ONBEVESTIGD', alternatives: e.alternatives }))
    : [];
  return {
    version: KOMPAS_CONTEXT_VERSION,
    generatedAt: at,
    requiredConsentScopes: REQUIRED_CONSENT_SCOPES,
    rules: OPEN_KOMPAS_RULES,
    userToldMe: of(TYPES.TOLD),
    userValues: of(TYPES.VALUE),
    userInterests: of(TYPES.INTEREST),
    confirmedByUser: of(TYPES.INSIGHT),
    openPossibilities: possibilities,
    // Bewust NIET meegegeven: archief, gecorrigeerde/verwijderde items, geschiedenis,
    // onderdrukte verbanden, gespreksteksten, id's en tijdstempels.
  };
}
