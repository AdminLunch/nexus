// Open Kompas — gedeelde regels voor een gespreksbeurt door een taalmodel (Claude).
// Puur: geen DOM, geen opslag, geen netwerk. De aanroeper levert de modelfunctie en de context
// (die via de P0-toestemming is samengesteld). De lokale waarborgen hebben altijd het laatste woord.
import { lintOutgoing } from './guards.js';
import { isSuppressed } from './memory.js';

export const KOMPAS_RULES = `Je bent NEXUS Kompas: een warme, nieuwsgierige gesprekspartner in een persoonlijke app. Je praat Nederlands, zoals een fijn mens dat doet.

Stijl:
- Kort: 1 tot 3 zinnen, meestal minder dan 50 woorden. Hooguit één vraag per beurt (soms geen vraag).
- Reageer eerst echt op wat de persoon zegt, in gewone woorden. Geen therapeutische clichés ("dank je dat je dat deelt", "ik hoor je"), geen opsommingen, geen herhaling van letterlijke zinnen.
- Volg de persoon. Lichtheid, humor en enthousiasme mogen als het past (hobby's, plezier, nieuwsgierigheid).
- Praktische vragen beantwoord je praktisch, zonder psychologische duiding.

Open Kompas (verplicht):
- Geen diagnoses, stoornissen of labels; geen persoonlijkheidstypes; zeg nooit "je bent (een) ...". Noem een aandoening alleen als de persoon die zelf noemt.
- Vermoedens zijn vragen, nooit feiten. Een mogelijk verband zet je NIET in "reply" maar in "reflection", met minstens één andere verklaring. Doe dat zelden: alleen als het echt iets toevoegt.
- Eerdere inzichten mogen als voorlopige context dienen voor persoonlijkere suggesties, maar nooit leiden tot vaste conclusies of het beperken van nieuwe mogelijkheden.
- Vraag niet steeds naar doelen; "weet ik niet" is prima. Stuur niet naar één levensdoel.
- Het is helemaal oké als iemand van onderwerp wisselt, iets overslaat of zegt dat iets niet klopt: neem dat licht en zonder verdediging aan.

Antwoord UITSLUITEND met één JSON-object, zonder uitleg ervoor of erna:
{"reply": "wat je zegt",
 "move": "listen|deepen|angle|switch|practical|skip|correction",
 "reflection": null of {"text": "Misschien ...?", "alternatives": ["andere mogelijke verklaring", "..."]},
 "remember": [{"type": "told|value|interest", "text": "kort, in de woorden van de persoon"}],
 "options": ["2 tot 3 korte antwoorden die de persoon zou kunnen aantikken, in de ik-vorm"]}
"remember" alleen voor iets wat de persoon zelf expliciet vertelde en mogelijk wil bewaren (anders []). Er wordt niets bewaard zonder dat de persoon daar zelf op tikt.`;

export const CHOICE_TEXT = {
  deeper: 'Ik wil hier verder op ingaan.',
  angle: 'Kun je het van een andere kant bekijken?',
  switch: 'Laten we het over iets heel anders hebben.',
  practical: 'Ik zoek een praktische oplossing.',
  skip: 'Die vraag sla ik liever over.',
  disagree: 'Dat klopt niet.',
};
export const choiceText = (id) => CHOICE_TEXT[id] || null;

export function parseJson(text) {
  const t = String(text || '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('geen JSON');
  return JSON.parse(t.slice(start, end + 1));
}


/** Berichten voor het model: regels + (toegestane) context als eerste beurt, daarna het gesprek. */
export function buildTurnMessages({ context = '', history = [], reflectionAllowed = true, extraNote = '' }) {
  const system = `${KOMPAS_RULES}
${context ? `\n${context}` : ''}${reflectionAllowed ? '' : '\nNu GEEN reflection geven (zet reflection op null): eerst luisteren.'}${extraNote ? `\n${extraNote}` : ''}`;
  const turns = history.slice(-16).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text || m.content || '') }));
  const msgs = [{ role: 'user', content: system }, { role: 'assistant', content: '{"reply":"Begrepen.","move":"listen","reflection":null,"remember":[],"options":[]}' }, ...turns];
  const clean = [];
  for (const m of msgs) { if (clean.length && clean.at(-1).role === m.role) clean.at(-1).content += `\n\n${m.content}`; else clean.push({ ...m }); }
  if (clean.at(-1).role !== 'user') clean.push({ role: 'user', content: '(ga verder)' });
  return clean;
}

/**
 * Lokale eindcontrole op Claude's beurt. Geeft een veilige, opgeschoonde beurt terug of null (→ terugvallen).
 */
export function checkTurn(turn, { userMentioned, memory, reflectionAllowed }) {
  if (!turn || typeof turn.reply !== 'string' || !turn.reply.trim()) return { ok: false, why: 'leeg antwoord' };
  const reply = turn.reply.trim().slice(0, 600);
  const lint = lintOutgoing(reply, { userMentioned });
  if (!lint.ok) return { ok: false, why: lint.violations.map((v) => v.rule).join(', ') };
  let reflection = null;
  if (reflectionAllowed && turn.reflection && typeof turn.reflection.text === 'string') {
    const text = turn.reflection.text.trim().slice(0, 240);
    const alts = (Array.isArray(turn.reflection.alternatives) ? turn.reflection.alternatives : []).map((a) => String(a).trim().slice(0, 160)).filter(Boolean).slice(0, 3);
    const rl = lintOutgoing(`${text} ${alts.join(' ')}`, { userMentioned, isHypothesis: true });
    if (text && alts.length && rl.ok && !isSuppressed(memory, text)) reflection = { text, alternatives: alts };
  }
  const remember = (Array.isArray(turn.remember) ? turn.remember : [])
    .filter((r) => r && ['told', 'value', 'interest'].includes(r.type) && typeof r.text === 'string' && r.text.trim().length >= 3)
    .slice(0, 2).map((r) => ({ kind: 'save', type: r.type, text: r.text.trim().slice(0, 200), topics: [] }))
    .filter((r) => lintOutgoing(r.text, { userMentioned }).ok);
  const options = (Array.isArray(turn.options) ? turn.options : []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 3)
    .filter((o) => lintOutgoing(o, { userMentioned }).ok);
  const MOVES = ['listen', 'deepen', 'angle', 'switch', 'practical', 'skip', 'correction'];
  return { ok: true, reply, move: MOVES.includes(turn.move) ? turn.move : 'listen', reflection, remember, options };
}
