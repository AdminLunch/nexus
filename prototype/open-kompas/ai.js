// Open Kompas — gesprekslaag via Claude (alleen in een Claude-artifact, alleen na toestemming).
// Claude formuleert; de Open Kompas-waarborgen blijven lokaal en hebben het laatste woord:
// taalcontrole (lintOutgoing), interpretatiebudget, onderdrukte verbanden, bewaren alleen na klik,
// en een vaste veiligheidsreactie. Valt Claude weg of faalt de controle, dan neemt de lokale motor het over.
import { guards, memory as M, buildKompasContext } from '../../js/kompas/index.js';

let samplePromise = null;
/** De sample-functie van de Claude-runtime, of null (niet in Claude, niet toegestaan of time-out). */
export function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      try {
        const end = Date.now() + 4000;
        while (!(window.claude && typeof window.claude.use === 'function') && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
        if (!window.claude?.use) return null;
        return await Promise.race([window.claude.use('sample'), new Promise((r) => setTimeout(() => r(null), 12000))]);
      } catch (_) { return null; }
    })();
  }
  return samplePromise;
}

const RULES = `Je bent NEXUS Kompas: een warme, nieuwsgierige gesprekspartner in een persoonlijke app. Je praat Nederlands, zoals een fijn mens dat doet.

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

const CHOICE_TEXT = {
  deeper: 'Ik wil hier verder op ingaan.',
  angle: 'Kun je het van een andere kant bekijken?',
  switch: 'Laten we het over iets heel anders hebben.',
  practical: 'Ik zoek een praktische oplossing.',
  skip: 'Die vraag sla ik liever over.',
  disagree: 'Dat klopt niet.',
};
export const choiceText = (id) => CHOICE_TEXT[id] || null;

function parseJson(text) {
  const t = String(text || '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('geen JSON');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Vraag Claude om de volgende beurt.
 * @param {object} o
 * @param {{role:'user'|'nexus', text:string}[]} o.history  gesprek tot nu toe (alleen tekst)
 * @param {object} o.memory   Kompas-geheugen (alleen buildKompasContext gaat mee)
 * @param {boolean} o.reflectionAllowed  interpretatiebudget (lokaal bepaald)
 */
export async function aiTurn(sample, { history, memory, reflectionAllowed, extraNote = '' }) {
  const ctx = buildKompasContext(memory);
  const context = {
    watDePersoonVertelde: ctx.userToldMe.map((x) => x.text),
    belangrijk: ctx.userValues.map((x) => x.text),
    nieuwsgierigNaar: ctx.userInterests.map((x) => x.text),
    bevestigdeInzichten: ctx.confirmedByUser.map((x) => x.text),
    onbevestigdeMogelijkheden: ctx.openPossibilities.map((x) => `${x.text} (ONBEVESTIGD)`),
  };
  const system = `${RULES}

Voorlopige context uit "Mijn Kompas" (mag helpen, is geen waarheid):
${JSON.stringify(context)}
${reflectionAllowed ? '' : '\nNu GEEN reflection geven (zet reflection op null): eerst luisteren.'}${extraNote ? `\n${extraNote}` : ''}`;
  const turns = history.slice(-16).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  const msgs = [{ role: 'user', content: system }, { role: 'assistant', content: '{"reply":"Begrepen.","move":"listen","reflection":null,"remember":[],"options":[]}' }, ...turns];
  const clean = [];
  for (const m of msgs) { if (clean.length && clean.at(-1).role === m.role) clean.at(-1).content += `\n\n${m.content}`; else clean.push({ ...m }); }
  if (clean.at(-1).role !== 'user') clean.push({ role: 'user', content: '(ga verder)' });
  const res = await sample(clean, { modelTier: 'default' });
  return parseJson(res?.text);
}

/**
 * Lokale eindcontrole op Claude's beurt. Geeft een veilige, opgeschoonde beurt terug of null (→ terugvallen).
 */
export function checkTurn(turn, { userMentioned, memory, reflectionAllowed }) {
  if (!turn || typeof turn.reply !== 'string' || !turn.reply.trim()) return { ok: false, why: 'leeg antwoord' };
  const reply = turn.reply.trim().slice(0, 600);
  const lint = guards.lintOutgoing(reply, { userMentioned });
  if (!lint.ok) return { ok: false, why: lint.violations.map((v) => v.rule).join(', ') };
  let reflection = null;
  if (reflectionAllowed && turn.reflection && typeof turn.reflection.text === 'string') {
    const text = turn.reflection.text.trim().slice(0, 240);
    const alts = (Array.isArray(turn.reflection.alternatives) ? turn.reflection.alternatives : []).map((a) => String(a).trim().slice(0, 160)).filter(Boolean).slice(0, 3);
    const rl = guards.lintOutgoing(`${text} ${alts.join(' ')}`, { userMentioned, isHypothesis: true });
    if (text && alts.length && rl.ok && !M.isSuppressed(memory, text)) reflection = { text, alternatives: alts };
  }
  const remember = (Array.isArray(turn.remember) ? turn.remember : [])
    .filter((r) => r && ['told', 'value', 'interest'].includes(r.type) && typeof r.text === 'string' && r.text.trim().length >= 3)
    .slice(0, 2).map((r) => ({ kind: 'save', type: r.type, text: r.text.trim().slice(0, 200), topics: [] }))
    .filter((r) => guards.lintOutgoing(r.text, { userMentioned }).ok);
  const options = (Array.isArray(turn.options) ? turn.options : []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 3)
    .filter((o) => guards.lintOutgoing(o, { userMentioned }).ok);
  const MOVES = ['listen', 'deepen', 'angle', 'switch', 'practical', 'skip', 'correction'];
  return { ok: true, reply, move: MOVES.includes(turn.move) ? turn.move : 'listen', reflection, remember, options };
}
