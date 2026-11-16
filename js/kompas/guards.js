// Open Kompas — waarborgen tegen aannames en tunnelvisie.
//
// Twee soorten controles:
//  1. Taalcontrole (lintOutgoing): elke zin die NEXUS wil zeggen, wordt gecontroleerd op
//     identiteitslabels, diagnoses, hypotheses-als-feit en levensdoel-sturing.
//  2. Gedragscontrole (budgetten): hoe vaak NEXUS zelf een onderwerp aansnijdt, psychologisch
//     interpreteert, naar doelen vraagt of oude inzichten opnieuw toetst.
// Alle limieten staan in POLICY, zodat ze zichtbaar en aanpasbaar zijn.

import { norm } from './util.js';
import { isPsychDomain } from './topics.js';

export const POLICY = Object.freeze({
  /** Max. aandeel beurten waarin NEXUS psychologisch reflecteert/interpreteert. */
  maxInterpretRatio: 0.34,
  /** Minimaal aantal beurten tussen twee interpretaties. */
  minTurnsBetweenInterpretations: 3,
  /** NEXUS mag per sessie hoogstens één keer zelf een eerder onderwerp terughalen. */
  maxNexusRecallsPerSession: 1,
  /** Na zoveel beurten op één onderwerp biedt NEXUS altijd expliciet een uitweg aan. */
  focusDepthBeforeExitOffer: 3,
  /** Hoogstens één doelvraag per sessie, nooit in de eerste sessie, en alleen als de gebruiker er zelf over begint. */
  maxGoalQuestionsPerSession: 1,
  /** Na "ik weet (nog) niet wat ik wil": zoveel dagen geen doelvragen. */
  goalCooldownDaysAfterUnsure: 21,
  /** Hoogstens één herijkingsvraag ("klopt dit nog?") per sessie. */
  maxReviewsPerSession: 1,
  /** Hoogstens één aanbod van een oefening (ACT/CGT/journaling) per sessie, tenzij gevraagd. */
  maxToolOffersPerSession: 1,
  /** Van de openingssuggesties mag er hoogstens één uit het geheugen komen. */
  maxMemoryBasedOpeners: 1,
});

// ---------------------------------------------------------------------------
// 1. Taalcontrole
// ---------------------------------------------------------------------------

/** Diagnose- en stoornistermen. NEXUS noemt deze alleen als de gebruiker ze zelf noemde. */
export const DIAGNOSTIC_TERMS = [
  'depressie', 'depressief', 'adhd', 'add', 'autisme', 'autistisch', 'asperger', 'angststoornis', 'paniekstoornis',
  'burn out', 'burnout', 'bipolair', 'borderline', 'narcis', 'narcistisch', 'ocd', 'dwangstoornis', 'ptss', 'trauma',
  'hechtingsstoornis', 'persoonlijkheidsstoornis', 'stoornis', 'eetstoornis', 'verslaving', 'verslaafd', 'hsp',
  'hoogsensitief', 'faalangst', 'perfectionist',
];

const IDENTITY_PATTERNS = [
  /\b(je bent|jij bent) (gewoon |echt |nu eenmaal |duidelijk |typisch |zo'?n? |eigenlijk )*(een|iemand|het type|de)\b/,
  /\bjij bent iemand die\b/,
  /\b(jouw|je) (persoonlijkheid(stype)?|type|profiel) (is|laat zien)\b/,
  /\btypisch (jij|voor jou)\b/,
  /\b(je bent|jij bent) (altijd|nooit)\b/,
  /\b(introvert|extravert|extrovert|introverte|extraverte) (persoon|type)\b/,
  /\b(mbti|enneagram|big five) ?(type)?\b/,
];

const CERTAINTY_PATTERNS = [
  /\b(het komt (door|doordat)|dat komt (door|doordat)|de oorzaak is|het probleem is dat je|in werkelijkheid|eigenlijk ben je|diep van binnen)\b/,
  /\b(je hebt last van|je lijdt aan|jij lijdt aan)\b/,
];

const LIFE_PURPOSE_PATTERNS = [
  /\b(je|jouw) (levensdoel|missie|roeping|bestemming|ware doel|echte doel)\b/,
  /\bwaar je voor (bestemd|gemaakt|geboren) bent\b/,
  /\b(je moet|jij moet) (eigenlijk )?(gaan|worden|kiezen voor)\b/,
];

const HEDGES = ['misschien', 'kan het zijn', 'zou het kunnen', 'zou kunnen', 'ik vraag me af', 'mogelijk', 'wellicht', 'herken je', 'klopt dat', 'of zit het anders', 'of is het iets anders', 'ik weet het niet zeker'];

/**
 * Controleer een uitgaande tekst.
 * @param {string} text
 * @param {{userMentioned?: string, isHypothesis?: boolean}} ctx  userMentioned = alles wat de gebruiker zelf zei in deze sessie
 * @returns {{ok: boolean, violations: {rule: string, detail: string}[]}}
 */
export function lintOutgoing(text, ctx = {}) {
  const t = ` ${norm(text)} `;
  const user = ` ${norm(ctx.userMentioned || '')} `;
  const violations = [];
  for (const term of DIAGNOSTIC_TERMS) {
    if (t.includes(` ${term}`)) {
      if (!user.includes(` ${term}`)) violations.push({ rule: 'no-diagnosis', detail: term });
    }
  }
  for (const p of IDENTITY_PATTERNS) if (p.test(t)) violations.push({ rule: 'no-identity-label', detail: p.source });
  for (const p of LIFE_PURPOSE_PATTERNS) if (p.test(t)) violations.push({ rule: 'no-life-purpose', detail: p.source });
  for (const p of CERTAINTY_PATTERNS) if (p.test(t)) violations.push({ rule: 'no-hypothesis-as-fact', detail: p.source });
  if (ctx.isHypothesis && !HEDGES.some((h) => t.includes(` ${h}`))) violations.push({ rule: 'hypothesis-needs-hedge', detail: 'geen voorzichtige formulering' });
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// 2. Gedragscontrole
// ---------------------------------------------------------------------------

const nexusTurns = (session) => session.turns.filter((t) => t.role === 'nexus');

/**
 * Mag NEXUS nu psychologisch reflecteren/interpreteren?
 * Nee als: de gebruiker praktisch/hobby/plezier bespreekt, of om een praktische oplossing vraagt,
 * of het interpretatiebudget op is, of er net al een interpretatie was, of de laatste werd afgewezen.
 */
export function allowInterpretation(session, { domain, intent }) {
  const reasons = [];
  if (!isPsychDomain(domain)) reasons.push('onderwerp vraagt niet om psychologische duiding');
  if (['practical', 'question', 'fun', 'skip', 'switch'].includes(intent)) reasons.push(`gebruiker wil nu: ${intent}`);
  const nt = nexusTurns(session);
  const interps = nt.filter((t) => t.move === 'reflect').length;
  if (nt.length && (interps + 1) / (nt.length + 1) > POLICY.maxInterpretRatio) reasons.push('interpretatiebudget voor deze sessie op');
  const lastIdx = nt.map((t) => t.move).lastIndexOf('reflect');
  if (lastIdx >= 0 && nt.length - lastIdx < POLICY.minTurnsBetweenInterpretations) reasons.push('net al een reflectie gegeven');
  if (session.flags?.lastReflectionRejected) reasons.push('vorige reflectie klopte niet — eerst luisteren');
  return { allowed: reasons.length === 0, reasons };
}

/** Mag NEXUS (zonder dat de gebruiker erom vraagt) een onderwerp uit het geheugen terughalen? */
export function allowRecall(session, topicId) {
  const reasons = [];
  if ((session.flags?.nexusRecalls || 0) >= POLICY.maxNexusRecallsPerSession) reasons.push('al een keer iets teruggehaald deze sessie');
  if (session.flags?.declinedTopics?.includes(topicId)) reasons.push('gebruiker liet dit onderwerp eerder deze sessie los');
  if (session.turns.some((t) => t.role === 'nexus' && t.recalledTopic === topicId)) reasons.push('dit onderwerp is al eens teruggehaald');
  return { allowed: reasons.length === 0, reasons };
}

/** Mag NEXUS naar doelen vragen? Alleen als de gebruiker er zelf over begint, en niet te vaak. */
export function allowGoalQuestion(session, { userRaisedGoals = false, now } = {}) {
  const reasons = [];
  if (!userRaisedGoals) reasons.push('gebruiker begon er niet zelf over');
  if (session.isFirstSession) reasons.push('eerste kennismaking: geen doelvragen');
  if ((session.flags?.goalQuestions || 0) >= POLICY.maxGoalQuestionsPerSession) reasons.push('al een doelvraag gesteld deze sessie');
  const until = session.preferences?.goalQuietUntil;
  if (until && Date.parse(until) > Date.parse(now || new Date().toISOString())) reasons.push('gebruiker gaf aan het nog niet te weten — even geen doelvragen');
  return { allowed: reasons.length === 0, reasons };
}

export function allowReview(session) {
  const n = session.flags?.reviews || 0;
  return { allowed: n < POLICY.maxReviewsPerSession && !session.isFirstSession, reasons: n >= POLICY.maxReviewsPerSession ? ['al een herijking deze sessie'] : [] };
}

export function allowToolOffer(session, { requested = false, domain } = {}) {
  if (requested) return { allowed: true, reasons: [] };
  const reasons = [];
  if ((session.flags?.toolOffers || 0) >= POLICY.maxToolOffersPerSession) reasons.push('al een oefening aangeboden');
  if (!isPsychDomain(domain)) reasons.push('onderwerp vraagt niet om een oefening');
  if (session.preferences?.toolsOff) reasons.push('gebruiker wil geen oefeningen aangeboden krijgen');
  return { allowed: reasons.length === 0, reasons };
}

/** Na een paar beurten op één onderwerp bieden we expliciet ruimte voor iets anders. */
export function shouldOfferExit(session) {
  return (session.focusDepth || 0) >= POLICY.focusDepthBeforeExitOffer;
}

/**
 * Verdeling van onderwerpen in een sessie. Signaleert als NEXUS (niet de gebruiker)
 * het gesprek steeds naar hetzelfde onderwerp trekt.
 */
export function tunnelReport(session) {
  const byTopic = {};
  for (const t of session.turns) {
    for (const id of t.topics || []) {
      byTopic[id] ||= { user: 0, nexusInitiated: 0 };
      if (t.role === 'user') byTopic[id].user += 1;
      else if (t.initiatedTopic) byTopic[id].nexusInitiated += 1;
    }
  }
  const flags = Object.entries(byTopic).filter(([, v]) => v.nexusInitiated > 1).map(([id]) => id);
  const domains = new Set(session.turns.filter((t) => t.role === 'user').map((t) => t.domain).filter(Boolean));
  const nt = nexusTurns(session);
  return {
    byTopic,
    nexusPulledBack: flags,
    domainVariety: domains.size,
    interpretRatio: nt.length ? nt.filter((t) => t.move === 'reflect').length / nt.length : 0,
  };
}
