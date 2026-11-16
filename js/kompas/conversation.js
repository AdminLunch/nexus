// Open Kompas — adaptieve gespreksmotor (lokaal, regelgebaseerd, zonder externe AI).
//
// De motor is puur: hij krijgt (sessie, geheugen, invoer) en geeft (nieuwe sessie, antwoord,
// geheugen-operaties) terug. Hij schrijft zelf NIETS weg. De aanroeper past geheugen-operaties
// alleen toe als ze voortkomen uit een expliciete keuze van de gebruiker (een knop).
//
// Elk antwoord bevat altijd de zes vaste keuzes (CORE_ACTIONS), zodat de gebruiker altijd kan:
// doorgaan, een andere invalshoek kiezen, over iets heel anders praten, een praktische
// oplossing zoeken, een vraag overslaan of aangeven dat iets niet klopt.

import { nowISO, addDaysISO, pick, defaultId } from './util.js';
import { detectTopics, detectIntent, detectSaveCandidates, echoPhrase, isPsychDomain, topicDomain, primaryDomain } from './topics.js';
import { lintOutgoing, allowInterpretation, allowRecall, allowGoalQuestion, allowReview, allowToolOffer, shouldOfferExit, POLICY } from './guards.js';
import { active, dueForReview, isSuppressed, TYPES } from './memory.js';
import { suggestTools, getTool } from './toolbox.js';

export const CORE_ACTIONS = Object.freeze([
  { id: 'deeper', label: 'Hier verder op' },
  { id: 'angle', label: 'Andere invalshoek' },
  { id: 'switch', label: 'Over iets heel anders' },
  { id: 'practical', label: 'Praktische oplossing' },
  { id: 'skip', label: 'Vraag overslaan' },
  { id: 'disagree', label: 'Dit klopt niet' },
]);

/** Invalshoeken. psych=true alleen bij onderwerpen waar dat past (zie guards/topics). */
export const ANGLES = Object.freeze([
  { id: 'concrete', psych: false, q: (e) => (e ? `Je noemde “${e}”. Hoe ziet dat er concreet uit?` : 'Hoe ziet dat er concreet uit?') },
  { id: 'works', psych: false, q: (e) => (e ? `Wat gaat er rond “${e}” eigenlijk wél goed, al is het klein?` : 'Wat gaat er eigenlijk wél goed, al is het klein?') },
  { id: 'time', psych: false, q: () => 'Is dit altijd zo geweest, of is er iets veranderd?' },
  { id: 'others', psych: false, q: () => 'Wie zijn er nog meer bij betrokken, of wie merkt er iets van?' },
  { id: 'curious', psych: false, q: () => 'Wat maakt het voor jou interessant of de moeite waard — als het dat is?' },
  { id: 'easier', psych: false, q: () => 'Wat zou het een beetje makkelijker of leuker maken?' },
  { id: 'notice', psych: true, q: (e) => (e ? `Wat merk je bij jezelf als je aan “${e}” denkt?` : 'Wat merk je bij jezelf als je eraan denkt?') },
  { id: 'matters', psych: true, q: () => 'Wat maakt dit belangrijk voor je — als het dat al is?' },
]);

/** Open, niet-psychologische vragen om nieuwe kanten te ontdekken (plezier, nieuwsgierigheid). */
export const OPEN_DOORS = Object.freeze([
  'Waar ben je de laatste tijd nieuwsgierig naar?',
  'Wat is iets waar je laatst om moest lachen?',
  'Als je een middag had zonder verplichtingen, wat zou je dan doen?',
  'Is er iets wat je altijd al eens had willen uitproberen?',
  'Wat heeft deze week je aandacht getrokken, groot of klein?',
  'Waar zou je graag eens iemand over horen vertellen?',
]);

const ACKS = {
  share: ['Dank je dat je dat vertelt.', 'Oké, ik volg je.', 'Helder.', 'Ik hoor je.'],
  light: ['Leuk!', 'Klinkt interessant.', 'Mooi.', 'Oké!'],
};

const DEFAULT_PREFS = { goalQuietUntil: null, toolsOff: false };

// ---------------------------------------------------------------------------
// Sessie starten — open kennismaking
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {object} o.memory       huidig geheugen (mag leeg)
 * @param {boolean} o.isFirstSession
 * @param {object} [o.preferences]
 */
export function startSession({ memory, isFirstSession = false, preferences = {}, now, idGen = defaultId } = {}) {
  const at = nowISO(now);
  const session = {
    id: idGen('ses'),
    startedAt: at,
    isFirstSession,
    preferences: { ...DEFAULT_PREFS, ...preferences },
    turns: [],
    currentTopic: null,
    currentDomain: 'open',
    focusDepth: 0,
    mode: 'open', // 'open' | 'practical' | 'tool' | 'safety'
    practical: null,
    tool: null,
    pendingReflection: null,
    pendingReview: null,
    awaitingCorrection: false,
    usedAngles: [],
    skippedQuestions: [],
    lastQuestion: null,
    flags: { interpretations: 0, nexusRecalls: 0, goalQuestions: 0, reviews: 0, toolOffers: 0, declinedTopics: [], lastReflectionRejected: false },
  };

  let text;
  const actions = [];
  if (isFirstSession) {
    text = 'Hoi, fijn dat je er bent. Je hoeft hier niets in te vullen en er is geen goed of fout antwoord. '
      + 'Je kunt vertellen waarom je NEXUS wilt gebruiken, beginnen over iets wat je bezighoudt of leuk vindt, of gewoon rondkijken. '
      + 'Je bepaalt zelf wat ik onthoud — en je kunt alles altijd aanpassen of wissen.';
    actions.push(
      { id: 'intro-why', label: 'Ik vertel waarom ik hier ben' },
      { id: 'intro-free', label: 'Ik begin gewoon ergens' },
      { id: 'intro-unsure', label: 'Ik weet het nog niet' },
      { id: 'practical', label: 'Iets praktisch regelen' },
      { id: 'intro-how', label: 'Wat doe je met wat ik vertel?' },
    );
  } else {
    text = 'Welkom terug. Waar heb je vandaag zin in? Dat mag iets heel anders zijn dan vorige keer.';
    actions.push({ id: 'intro-free', label: 'Ik begin gewoon' }, { id: 'open-door', label: 'Stel me een verrassende vraag' }, { id: 'practical', label: 'Iets praktisch regelen' });
    // Hoogstens één suggestie op basis van het geheugen (geen vast spoor uit het verleden).
    const opener = memoryOpener(session, memory, at);
    if (opener) {
      text += ` ${opener.text}`;
      actions.unshift(...opener.actions);
    }
  }
  return finish(session, { text, move: 'intro', actions }, { at });
}

function memoryOpener(session, memory, at) {
  if (!memory || POLICY.maxMemoryBasedOpeners < 1) return null;
  // Onbevestigde verbanden worden nooit als "we noteerden" teruggehaald; die verlopen vanzelf.
  const review = allowReview(session).allowed ? dueForReview(memory, { now: at }).find((e) => e.type !== TYPES.POSSIBLE) : null;
  if (review) {
    session.pendingReview = review.id;
    session.flags.reviews += 1;
    return {
      text: `Een tijd geleden noteerden we: “${review.text}”. Klopt dat nog, of is het intussen anders? Je mag dit ook overslaan.`,
      actions: [
        { id: 'review-still', label: 'Klopt nog', payload: review.id },
        { id: 'review-outdated', label: 'Niet meer', payload: review.id },
        { id: 'review-later', label: 'Later', payload: review.id },
      ],
    };
  }
  const interest = active(memory).filter((e) => e.type === TYPES.INTEREST).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
  if (interest) {
    return { text: '', actions: [{ id: 'recall-interest', label: `Iets over “${interest.text}”?`, payload: interest.id }] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reageren op invoer
// ---------------------------------------------------------------------------

/**
 * @param {object} session
 * @param {object} memory
 * @param {{type:'text', text:string} | {type:'action', id:string, payload?:any}} input
 * @returns {{session, reply, memoryOps: object[]}}
 */
export function respond(session, memory, input, { now } = {}) {
  const at = nowISO(now);
  const s = structuredClone(session);
  const ops = [];
  if (input.type === 'action') return handleAction(s, memory, input, at, ops);
  return handleText(s, memory, String(input.text || '').trim(), at, ops);
}

function handleText(s, memory, text, at, ops) {
  if (!text) return finish(s, { text: 'Neem gerust de tijd.', move: 'listen' }, { at, ops });
  const intent = detectIntent(text);
  const topics = detectTopics(text);
  const topicIds = topics.map((t) => t.id);
  const domain = primaryDomain(topics) || (intent === 'practical' ? 'practical' : s.currentDomain === 'open' ? 'open' : s.currentDomain);
  s.turns.push({ role: 'user', text, at, intent, topics: topicIds, domain });

  // Onderwerpdiepte bijhouden (voor de uitweg-check).
  const sameTopic = s.currentTopic && topicIds.includes(s.currentTopic);
  if (topicIds.length && !sameTopic) { s.currentTopic = topicIds[0]; s.focusDepth = 1; }
  else if (sameTopic || !topicIds.length) s.focusDepth += 1;
  s.currentDomain = domain;

  const proposals = detectSaveCandidates(text).map((c) => ({ kind: 'save', type: c.type, text: c.text, topics: topicIds }));

  // 1. Veiligheid gaat altijd voor.
  if (intent === 'safety') return safety(s, at, ops);

  // 2. Expliciete stuursignalen in tekst = dezelfde rechten als de knoppen.
  if (intent === 'disagree') return disagree(s, memory, at, ops);
  if (intent === 'skip') return skip(s, memory, at, ops);
  if (intent === 'switch') return switchTopic(s, at, ops);

  // 3. Correctie in eigen woorden na "dit klopt niet".
  if (s.awaitingCorrection) {
    s.awaitingCorrection = false;
    return finish(s, {
      text: 'Dank je, zo begrijp ik het beter. Wil je dat ik het zo onthoud, in jouw woorden? Hoeft niet.',
      move: 'listen',
      proposals: [{ kind: 'save', type: 'told', text: text.slice(0, 500), topics: topicIds }],
    }, { at, ops });
  }

  // 4. Lopende praktische modus of oefening.
  if (s.mode === 'practical') return practicalStep(s, text, at, ops, proposals);
  if (s.mode === 'tool') return toolStep(s, text, at, ops, proposals);

  if (intent === 'practical') return startPractical(s, text, at, ops, proposals);
  if (intent === 'tools') return offerTools(s, domain, at, ops, true);
  if (intent === 'unsure') return unsure(s, at, ops, proposals);
  if (intent === 'goals') return goals(s, at, ops, proposals);

  // 5. Standaard: luisteren en aansluiten op de woorden van de gebruiker.
  return listen(s, memory, text, { domain, topicIds, intent }, at, ops, proposals);
}

function handleAction(s, memory, { id, payload }, at, ops) {
  s.turns.push({ role: 'user', action: id, at, topics: [], domain: s.currentDomain });
  switch (id) {
    case 'deeper': return deeper(s, at, ops);
    case 'angle': return angle(s, at, ops);
    case 'switch': return switchTopic(s, at, ops);
    case 'practical': return startPractical(s, '', at, ops, []);
    case 'skip': return skip(s, memory, at, ops);
    case 'disagree': return disagree(s, memory, at, ops);
    case 'intro-why': return finish(s, { text: 'Vertel maar, in je eigen woorden — zo kort of lang als je wilt. Het mag ook vaag of nog onaf zijn.', move: 'listen' }, { at, ops });
    case 'intro-free': return finish(s, { text: 'Begin maar waar je wilt: iets wat je bezighoudt, iets wat je leuk vindt of iets wat geregeld moet worden.', move: 'listen' }, { at, ops });
    case 'intro-unsure': return unsure(s, at, ops, []);
    case 'intro-how': return finish(s, { text: howItWorks(), move: 'explain' }, { at, ops });
    case 'open-door': return openDoor(s, at, ops, 'Goed idee.');
    case 'recall-interest': {
      const e = memory && active(memory).find((x) => x.id === payload);
      s.flags.nexusRecalls += 1;
      return finish(s, { text: e ? `Je vertelde eerder dat je nieuwsgierig bent naar “${e.text}”. Is dat nog zo, of is er intussen iets anders dat je trekt?` : 'Vertel maar.', move: 'recall', recalledTopic: e?.topics?.[0] }, { at, ops });
    }
    case 'reflection-confirm': return reflectionAnswer(s, 'confirm', at, ops);
    case 'reflection-maybe': return reflectionAnswer(s, 'maybe', at, ops);
    case 'review-still': ops.push({ op: 'reaffirm', id: payload }); s.pendingReview = null; return finish(s, { text: 'Fijn, dan laat ik het zo staan. Waar wil je het vandaag over hebben?', move: 'review' }, { at, ops });
    case 'review-outdated': ops.push({ op: 'markOutdated', id: payload }); s.pendingReview = null; return finish(s, { text: 'Dank je, ik zet het in het archief — het speelt dan niet meer mee. Wil je vertellen hoe het nu zit, of liever over iets anders?', move: 'review' }, { at, ops });
    case 'review-later': ops.push({ op: 'postponeReview', id: payload }); s.pendingReview = null; return finish(s, { text: 'Prima, ik vraag het een andere keer. Waar heb je nu zin in?', move: 'review' }, { at, ops });
    case 'tool-start': return startTool(s, payload, at, ops);
    case 'tools-off': s.preferences.toolsOff = true; return finish(s, { text: 'Helder, ik bied geen oefeningen meer aan. Je kunt er altijd zelf om vragen.', move: 'listen', preferencesChanged: { toolsOff: true } }, { at, ops });
    default: return finish(s, { text: 'Vertel gerust verder.', move: 'listen' }, { at, ops });
  }
}

// ---------------------------------------------------------------------------
// Gespreksbewegingen
// ---------------------------------------------------------------------------

function lastUserText(s) {
  for (let i = s.turns.length - 1; i >= 0; i--) if (s.turns[i].role === 'user' && s.turns[i].text) return s.turns[i].text;
  return '';
}
const userTurnsOnTopic = (s, topic) => s.turns.filter((t) => t.role === 'user' && t.text && (topic ? t.topics.includes(topic) : true));
const nTurns = (s) => s.turns.length;

function chooseAngle(s, { allowPsych, preferNot = [] }) {
  const usable = ANGLES.filter((a) => (allowPsych || !a.psych) && !s.skippedQuestions.includes(a.id));
  const fresh = usable.filter((a) => !s.usedAngles.includes(a.id) && !preferNot.includes(a.id));
  const list = fresh.length ? fresh : usable.filter((a) => !preferNot.includes(a.id));
  return pick(list.length ? list : ANGLES.filter((a) => !a.psych), nTurns(s));
}

function ask(s, angleObj, echo) {
  s.usedAngles.push(angleObj.id);
  s.lastQuestion = angleObj.id;
  return angleObj.q(echo);
}

function listen(s, memory, text, { domain, topicIds, intent }, at, ops, proposals) {
  const psychOK = allowInterpretation(s, { domain, intent });
  const ackList = ['interest', 'play'].includes(domain) ? ACKS.light : ACKS.share;
  const parts = [pick(ackList, nTurns(s))];
  let move = 'listen';
  let initiatedTopic = false;
  let recalledTopic = null;

  // Mogelijk verband voorleggen — alleen als de waarborgen het toelaten en er
  // twee eigen uitspraken over hetzelfde onderwerp zijn om met elkaar te verbinden.
  const onTopic = userTurnsOnTopic(s, s.currentTopic);
  if (psychOK.allowed && onTopic.length >= 2 && !s.pendingReflection) {
    const a = echoPhrase(onTopic[onTopic.length - 2].text, 6);
    const b = echoPhrase(onTopic[onTopic.length - 1].text, 6);
    const candidate = `Misschien hebben “${a}” en “${b}” iets met elkaar te maken`;
    if (a && b && a !== b && !(memory && isSuppressed(memory, candidate, { now: at }))) {
      const alternatives = ['Het kan ook toeval zijn dat je ze na elkaar noemt.', 'Misschien speelt er iets anders mee dat je nog niet noemde.'];
      s.pendingReflection = { text: candidate, alternatives, topics: topicIds, evidence: [nTurns(s) - 1] };
      s.flags.interpretations += 1;
      s.flags.lastReflectionRejected = false;
      return finish(s, {
        text: `${parts[0]} Ik vraag me af: ${candidate.charAt(0).toLowerCase()}${candidate.slice(1)}? ${alternatives[0]} ${alternatives[1]} Herken je daar iets van, of zit het anders?`,
        move: 'reflect',
        isHypothesis: true,
        actions: [
          { id: 'reflection-confirm', label: 'Ja, dat klopt' },
          { id: 'reflection-maybe', label: 'Misschien — bewaar als mogelijkheid' },
          { id: 'disagree', label: 'Nee, klopt niet' },
          { id: 'skip', label: 'Laat maar' },
        ],
        proposals,
      }, { at, ops });
    }
  }

  // De gebruiker zegt iets wat hij/zij belangrijk vindt of leuk vindt: niet doorvragen, eerst ruimte geven.
  if (proposals.length) {
    const kind = proposals[0].type === 'value' ? 'iets wat belangrijk voor je is' : 'iets waar je plezier of nieuwsgierigheid in hebt';
    parts.push(`Dat klinkt als ${kind}. Wil je dat ik dat onthoud? Je kunt ook gewoon verder vertellen.`);
    return finish(s, { text: parts.join(' '), move: 'listen', proposals }, { at, ops });
  }

  // Een eigen eerdere uitspraak terughalen — als vraag, hoogstens één keer per sessie.
  const linked = memory && topicIds.length
    ? active(memory).find((e) => e.type !== TYPES.POSSIBLE && e.topics.some((t) => topicIds.includes(t)))
    : null;
  if (linked && allowRecall(s, linked.topics[0]).allowed && onTopic.length === 1) {
    s.flags.nexusRecalls += 1;
    recalledTopic = linked.topics[0];
    parts.push(`Je vertelde eerder: “${linked.text}”. Speelt dat hier mee, of staat het er los van?`);
    move = 'recall';
  } else {
    const ang = chooseAngle(s, { allowPsych: psychOK.allowed });
    parts.push(ask(s, ang, echoPhrase(text)));
  }

  if (shouldOfferExit(s)) parts.push('We kunnen hier verder op ingaan, maar net zo goed over iets anders praten — wat jij wilt.');
  return finish(s, { text: parts.join(' '), move, proposals, recalledTopic, initiatedTopic, guardInfo: { interpretation: psychOK } }, { at, ops });
}

function deeper(s, at, ops) {
  const last = lastUserText(s);
  if (!last) return finish(s, { text: 'Waar zou je graag verder op ingaan?', move: 'deepen' }, { at, ops });
  const echo = echoPhrase(last);
  const psych = allowInterpretation(s, { domain: s.currentDomain, intent: 'share' }).allowed;
  const opts = psych ? ['concrete', 'notice', 'time'] : ['concrete', 'time', 'others'];
  const ang = ANGLES.find((a) => opts.includes(a.id) && !s.usedAngles.includes(a.id) && !s.skippedQuestions.includes(a.id))
    || chooseAngle(s, { allowPsych: psych });
  s.focusDepth += 1;
  return finish(s, { text: `Laten we daar verder op ingaan. ${ask(s, ang, echo)}`, move: 'deepen' }, { at, ops });
}

function angle(s, at, ops) {
  const psych = allowInterpretation(s, { domain: s.currentDomain, intent: 'share' }).allowed;
  const ang = chooseAngle(s, { allowPsych: psych, preferNot: [s.lastQuestion] });
  return finish(s, { text: `Een andere kant: ${ask(s, ang, echoPhrase(lastUserText(s)))}`, move: 'angle' }, { at, ops });
}

function switchTopic(s, at, ops) {
  if (s.currentTopic && !s.flags.declinedTopics.includes(s.currentTopic)) s.flags.declinedTopics.push(s.currentTopic);
  s.currentTopic = null;
  s.currentDomain = 'open';
  s.focusDepth = 0;
  s.mode = 'open';
  s.practical = null;
  s.tool = null;
  s.pendingReflection = null;
  return openDoor(s, at, ops, 'Prima, dat laten we los.');
}

function openDoor(s, at, ops, lead) {
  const q = pick(OPEN_DOORS, nTurns(s) + s.flags.declinedTopics.length);
  return finish(s, {
    text: `${lead} Waar wil je het over hebben? Het mag van alles zijn. Of, als je wilt: ${q.charAt(0).toLowerCase()}${q.slice(1)}`,
    move: 'switch',
    actions: [{ id: 'intro-free', label: 'Ik weet al iets' }, { id: 'open-door', label: 'Andere vraag' }, { id: 'practical', label: 'Iets praktisch' }],
  }, { at, ops });
}

function skip(s, memory, at, ops) {
  if (s.pendingReflection) {
    ops.push({ op: 'noteSkippedPossible', text: s.pendingReflection.text });
    s.pendingReflection = null;
    return finish(s, { text: 'Geen probleem, die laat ik liggen. Waar wil je verder mee?', move: 'skip' }, { at, ops });
  }
  if (s.lastQuestion) s.skippedQuestions.push(s.lastQuestion);
  s.lastQuestion = null;
  if (s.mode === 'practical' && s.practical) { s.practical.step += 1; return practicalPrompt(s, at, ops, 'Prima, die slaan we over.'); }
  return finish(s, {
    text: 'Prima, die vraag laat ik liggen — je hoeft niets uit te leggen. Wil je iets anders vertellen, of zal ik het van een andere kant bekijken?',
    move: 'skip',
    actions: [{ id: 'angle', label: 'Andere kant' }, { id: 'switch', label: 'Iets anders' }],
  }, { at, ops });
}

function disagree(s, memory, at, ops) {
  const lastNexus = [...s.turns].reverse().find((t) => t.role === 'nexus');
  s.flags.lastReflectionRejected = true;
  s.awaitingCorrection = true;
  if (s.pendingReflection) {
    ops.push({ op: 'noteRejectedPossible', text: s.pendingReflection.text });
    s.pendingReflection = null;
    return finish(s, { text: 'Dank je, dan zat ik ernaast — ik laat dat los en kom er niet op terug. Hoe zie jij het zelf? Je mag het ook gewoon laten rusten.', move: 'correction' }, { at, ops });
  }
  if (lastNexus?.move === 'recall') {
    return finish(s, { text: 'Dan heb ik dat verkeerd verbonden, sorry. Wil je vertellen hoe het wel zit? Je kunt het ook aanpassen of wissen onder “Mijn Kompas”.', move: 'correction' }, { at, ops });
  }
  return finish(s, { text: 'Dan heb ik je verkeerd begrepen. Wat klopt er niet? Jouw versie telt.', move: 'correction' }, { at, ops });
}

function reflectionAnswer(s, kind, at, ops) {
  const r = s.pendingReflection;
  s.pendingReflection = null;
  if (!r) return finish(s, { text: 'Vertel gerust verder.', move: 'listen' }, { at, ops });
  if (kind === 'confirm') {
    ops.push({ op: 'addPossibleThenConfirm', text: r.text, alternatives: r.alternatives, topics: r.topics, evidence: r.evidence });
    return finish(s, { text: 'Dank je. Ik bewaar het als iets wat jij herkent — je kunt het altijd aanpassen of wissen. Wil je hier verder op, of ergens anders heen?', move: 'listen' }, { at, ops });
  }
  ops.push({ op: 'addPossible', text: r.text, alternatives: r.alternatives, topics: r.topics, evidence: r.evidence });
  return finish(s, { text: 'Oké, ik bewaar het als een open mogelijkheid — niet als feit. Als ik het later nog eens benoem, vraag ik het opnieuw na. Hoe wil je verder?', move: 'listen' }, { at, ops });
}

function unsure(s, at, ops, proposals) {
  const quiet = addDaysISO(at, 21);
  s.preferences.goalQuietUntil = quiet;
  return finish(s, {
    text: 'Dat hoeft ook helemaal niet. Je mag hier zijn zonder te weten wat je wilt of waar het heen moet. We kunnen gewoon wat rondkijken, over iets leuks praten of iets kleins regelen.',
    move: 'listen',
    actions: [{ id: 'open-door', label: 'Stel me een luchtige vraag' }, { id: 'intro-free', label: 'Ik begin ergens' }, { id: 'practical', label: 'Iets regelen' }],
    proposals,
    preferencesChanged: { goalQuietUntil: quiet },
  }, { at, ops });
}

function goals(s, at, ops, proposals) {
  const ok = allowGoalQuestion(s, { userRaisedGoals: true, now: at });
  if (!ok.allowed) {
    return finish(s, { text: 'Vertel maar wat je bedoelt — je hoeft er niets mee te doen of iets te kiezen.', move: 'listen', proposals, guardInfo: { goal: ok } }, { at, ops });
  }
  s.flags.goalQuestions += 1;
  return finish(s, {
    text: 'Je noemt doelen. Bedoel je iets concreets wat je wilt bereiken, of meer een richting die je aanspreekt? Allebei prima — en “weet ik nog niet” ook.',
    move: 'goal',
    proposals,
  }, { at, ops });
}

// --- Praktische modus: geen psychologie, alleen helder krijgen en een kleine stap ---

const PRACTICAL_STEPS = [
  { key: 'problem', q: 'Wat wil je precies geregeld of opgelost hebben?' },
  { key: 'tried', q: 'Wat heb je al geprobeerd, of wat ligt er al klaar?' },
  { key: 'step', q: 'Wat is het kleinste stukje dat je in de komende 24 uur kunt doen?' },
  { key: 'when', q: 'Wanneer en waar ga je dat doen? (Mag ook “weet ik nog niet”.)' },
];

function startPractical(s, text, at, ops, proposals) {
  s.mode = 'practical';
  s.pendingReflection = null;
  s.practical = { step: 0, answers: {} };
  const userHasContext = text && text.split(' ').length > 4;
  if (userHasContext) { s.practical.answers.problem = text; s.practical.step = 1; return practicalPrompt(s, at, ops, 'Laten we het praktisch maken.', proposals); }
  // Via de knop: niet zelf aannemen waar het over gaat, maar het vorige onderwerp hoogstens aanbieden.
  const prev = lastUserText(s);
  s.practical.suggested = prev || null;
  s.lastQuestion = 'practical-problem';
  const offer = prev ? ` Gaat het om “${echoPhrase(prev, 10)}”? Dan is “ja” genoeg.` : '';
  return finish(s, { text: `Laten we het praktisch maken. Wat wil je precies geregeld of opgelost hebben?${offer}`, move: 'practical', proposals }, { at, ops });
}

function practicalPrompt(s, at, ops, lead, proposals = []) {
  const p = s.practical;
  if (p.step >= PRACTICAL_STEPS.length) return practicalSummary(s, at, ops, proposals);
  const step = PRACTICAL_STEPS[p.step];
  s.lastQuestion = `practical-${step.key}`;
  const ctx = p.step === 1 && p.answers.problem ? ` Het gaat om: “${echoPhrase(p.answers.problem, 10)}”.` : '';
  return finish(s, { text: `${lead}${ctx} ${step.q}`, move: 'practical', proposals }, { at, ops });
}

function practicalStep(s, text, at, ops, proposals) {
  const p = s.practical;
  const yes = /^(ja|jep|klopt|precies|yes)\b/i.test(text);
  p.answers[PRACTICAL_STEPS[p.step].key] = p.step === 0 && yes && p.suggested ? p.suggested : text;
  p.step += 1;
  return practicalPrompt(s, at, ops, pick(['Oké.', 'Helder.', 'Goed.'], p.step), proposals);
}

function practicalSummary(s, at, ops, proposals) {
  const a = s.practical.answers;
  const lines = ['Samengevat:'];
  if (a.problem) lines.push(`• Wat je wilt regelen: ${echoPhrase(a.problem, 14)}`);
  if (a.tried) lines.push(`• Wat er al is: ${echoPhrase(a.tried, 14)}`);
  if (a.step) lines.push(`• Eerste kleine stap: ${echoPhrase(a.step, 14)}`);
  if (a.when) lines.push(`• Wanneer: ${echoPhrase(a.when, 10)}`);
  lines.push('Wil je hier nog iets aan schaven, of is het zo goed?');
  s.mode = 'open';
  s.practical = null;
  return finish(s, { text: lines.join('\n'), move: 'practical', proposals }, { at, ops });
}

// --- Optionele oefeningen ---

function offerTools(s, domain, at, ops, requested) {
  const ok = allowToolOffer(s, { requested, domain });
  if (!ok.allowed) return finish(s, { text: 'Vertel gerust verder.', move: 'listen', guardInfo: { tools: ok } }, { at, ops });
  s.flags.toolOffers += 1;
  const tools = suggestTools(domain);
  return finish(s, {
    text: `Er zijn een paar dingen die je kunt proberen, helemaal vrijblijvend: ${tools.map((t) => `${t.name} (${t.approach})`).join(' of ')}. Of gewoon verder praten — ook goed.`,
    move: 'tool-offer',
    actions: [...tools.map((t) => ({ id: 'tool-start', label: t.name, payload: t.id })), { id: 'tools-off', label: 'Liever geen oefeningen' }],
  }, { at, ops });
}

function startTool(s, toolId, at, ops) {
  const tool = getTool(toolId);
  if (!tool) return finish(s, { text: 'Die oefening ken ik niet. Vertel gerust verder.', move: 'listen' }, { at, ops });
  s.mode = 'tool';
  s.tool = { id: tool.id, step: 0 };
  return finish(s, { text: `${tool.name}: ${tool.intro} Je kunt op elk moment stoppen.\n${tool.steps[0]}`, move: 'tool' }, { at, ops });
}

function toolStep(s, text, at, ops, proposals) {
  const tool = getTool(s.tool.id);
  s.tool.step += 1;
  if (s.tool.step >= tool.steps.length) {
    s.mode = 'open';
    s.tool = null;
    return finish(s, { text: 'Dat was het. Hoe was dat? Er hoeft niets uit te komen. Je antwoorden bewaar ik niet, tenzij je dat zelf wilt.', move: 'tool', proposals }, { at, ops });
  }
  return finish(s, { text: tool.steps[s.tool.step], move: 'tool', proposals }, { at, ops });
}

// --- Veiligheid ---

function safety(s, at, ops) {
  s.mode = 'safety';
  s.pendingReflection = null;
  return finish(s, {
    text: 'Wat je schrijft klinkt heel zwaar, en ik vind het belangrijk dat je hier niet alleen mee blijft. '
      + 'Je kunt dag en nacht anoniem praten met 113 Zelfmoordpreventie: bel 0800-0113 (gratis) of chat via 113.nl. '
      + 'Bij direct gevaar: bel 112. Ik ben een app en geen hulpverlener, maar je mag hier ook gewoon verder praten.',
    move: 'safety',
    actions: [{ id: 'intro-free', label: 'Ik wil verder praten' }],
  }, { at, ops });
}

function howItWorks() {
  return 'Wat je vertelt, gebruik ik om aan te sluiten op jou — niet om je in een hokje te plaatsen. '
    + 'Ik onthoud alleen iets als jij op “Onthouden” drukt. Mijn eigen vermoedens zijn altijd voorlopig: ik leg ze aan je voor, en alleen jij kunt ze bevestigen. '
    + 'Onder “Mijn Kompas” zie je alles wat ik weet, en kun je het aanpassen, als verouderd markeren of wissen. '
    + 'In deze testversie wordt nog niets opgeslagen of verstuurd.';
}

// ---------------------------------------------------------------------------
// Afronden: taalcontrole + vaste keuzes toevoegen
// ---------------------------------------------------------------------------

const SAFE_FALLBACK = 'Vertel gerust verder — ik luister. Of kies hieronder een andere richting.';

function finish(s, reply, { at, ops = [] }) {
  const userMentioned = s.turns.filter((t) => t.role === 'user' && t.text).map((t) => t.text).join(' ');
  const lint = lintOutgoing(reply.text, { userMentioned, isHypothesis: !!reply.isHypothesis });
  let text = reply.text;
  if (!lint.ok) {
    text = SAFE_FALLBACK;
    if (reply.move === 'reflect') s.pendingReflection = null;
  }
  s.turns.push({
    role: 'nexus',
    text,
    at,
    move: lint.ok ? reply.move : 'listen',
    topics: s.currentTopic ? [s.currentTopic] : [],
    initiatedTopic: !!reply.initiatedTopic,
    recalledTopic: reply.recalledTopic || null,
  });
  return {
    session: s,
    reply: {
      text,
      move: lint.ok ? reply.move : 'listen',
      actions: reply.actions || [],
      coreActions: CORE_ACTIONS,
      proposals: (reply.proposals || []).filter((p) => p.text && p.text.length >= 3),
      preferencesChanged: reply.preferencesChanged || null,
      guard: { lint, ...(reply.guardInfo || {}) },
    },
    memoryOps: ops,
  };
}

export { isPsychDomain, topicDomain };
