// NEXUS — één gesprek: NEXUS Core-commando's + Open Kompas-gesprek (lokaal of via Claude).
// Volgorde per bericht:
//  1. Commando's (prioriteit:, water, ontbijt:, gegeten: …) altijd lokaal.
//  2. Signalen van nood: altijd de vaste lokale veiligheidsreactie, nooit naar een AI.
//  3. Claude (alleen in het artifact, alleen na P0-toestemming voor claude.ai): Claude formuleert,
//     de Open Kompas-waarborgen (js/kompas/aiturn.js) controleren; bij twijfel lokale terugval.
//  4. Eigen model (OpenAI-compatibel): bestaande provider, met P0-toestemming.
//  5. Lokaal: korte vragen → NEXUS Core (samenvatting, slaap …); gesprekszinnen → Open Kompas.
import { getState, update } from './store.js';
import { esc } from './ui.js';
import { startSession, respond, applyOps, buildTurnMessages, parseJson, checkTurn, choiceText, topics } from './kompas/index.js';
import { runCommand, localCoreReply, activeProvider } from './ai/engine.js';
import { buildAiRequest, grantedScopes, hasDecided, logShare, CLAUDE_HOST } from './privacy/consent.js';

let session = null;
let pending = null;          // { text, alternatives } — mogelijk verband dat op antwoord wacht
let sinceReflection = 99;
let rejected = false;
let current = { actions: [], proposals: [] };

export const kompasState = () => current;
const mem = () => getState().kompas;
const setMem = (m) => update((st) => { st.kompas = m; });

/** Start (eenmalig per app-sessie) een Kompas-sessie; geeft de openingsbeurt terug. */
export function ensureSession() {
  if (session) return null;
  const first = !(mem().sessions > 0);
  const r = startSession({ memory: mem(), isFirstSession: first });
  session = r.session;
  update((st) => { st.kompas.sessions = (st.kompas.sessions || 0) + 1; }, { silent: true });
  current = { actions: r.reply.actions, proposals: [] };
  return r.reply;
}
export function resetKompasSession() { session = null; pending = null; sinceReflection = 99; rejected = false; current = { actions: [], proposals: [] }; }

function localKompas(input) {
  if (!session) ensureSession();
  const r = respond(session, mem(), input);
  session = r.session;
  if (r.memoryOps.length) setMem(applyOps(mem(), r.memoryOps));
  current = { actions: r.reply.actions, proposals: r.reply.proposals };
  return { html: esc(r.reply.text), move: r.reply.move };
}

let samplePromise = null;
function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      try {
        if (!window.claude?.use) return null;
        return await Promise.race([window.claude.use('sample'), new Promise((res) => setTimeout(() => res(null), 12000))]);
      } catch (_) { return null; }
    })();
  }
  return samplePromise;
}

async function claudeTurn(userText, history) {
  const sample = await getSample();
  if (!sample) throw new Error('Claude is alleen beschikbaar als NEXUS als Claude-artifact draait');
  const scopes = grantedScopes(CLAUDE_HOST);
  const req = buildAiRequest(userText, history, scopes);
  const context = req.messages[0].content;
  const turns = req.messages.slice(1).map((m) => ({ role: m.role === 'user' ? 'user' : 'nexus', text: m.content }));
  const userMentioned = turns.filter((m) => m.role === 'user').map((m) => m.text).join(' ');
  const reflectionAllowed = sinceReflection >= 3 && !rejected;
  let checked = null;
  let why = '';
  for (let attempt = 0; attempt < 2 && !checked?.ok; attempt++) {
    const msgs = buildTurnMessages({ context, history: turns, reflectionAllowed, extraNote: why ? `Je vorige antwoord voldeed niet aan de regels (${why}). Probeer het opnieuw, korter en zonder labels of stellige conclusies.` : '' });
    logShare({ host: CLAUDE_HOST, ...req.shared });
    const res = await sample(msgs, { modelTier: 'default' });
    checked = checkTurn(parseJson(res?.text), { userMentioned, memory: mem(), reflectionAllowed });
    if (!checked.ok) why = checked.why;
  }
  if (!checked.ok) throw new Error(`antwoord voldeed niet aan de regels (${checked.why})`);
  sinceReflection += 1;
  if (rejected && sinceReflection >= 2) rejected = false;
  const actions = [];
  let extra = null;
  if (checked.reflection) {
    pending = checked.reflection;
    sinceReflection = 0;
    extra = { html: esc(`${pending.text}\n${pending.alternatives.map((a) => `Of misschien: ${a}`).join('\n')}\nHerken je dat, of zit het anders?`), move: 'reflect' };
    actions.push({ id: 'r-confirm', label: 'Ja, dat klopt' }, { id: 'r-maybe', label: 'Misschien — bewaar als mogelijkheid' }, { id: 'r-no', label: 'Nee, klopt niet' }, { id: 'r-skip', label: 'Laat maar' });
  } else {
    checked.options.forEach((o) => actions.push({ id: 'quick', label: o, payload: o }));
  }
  current = { actions, proposals: checked.remember };
  return { html: esc(checked.reply), move: checked.move, extra };
}

const isShortQuestion = (t) => topics.detectIntent(t) === 'question' || t.trim().split(/\s+/).length <= 3;

/**
 * Eén beurt op een getypt bericht. history = eerdere chatberichten ({role, text}).
 * Geeft { html, move, extra?, local? } terug; acties en voorstellen via kompasState().
 */
export async function kompasTurn(text, history = []) {
  current = { actions: [], proposals: [] };
  const cmd = runCommand(text.trim());
  if (cmd) return { html: cmd, move: 'command' };
  if (topics.detectIntent(text) === 'safety') { pending = null; return localKompas({ type: 'text', text }); }
  const provider = activeProvider();
  if (provider.id === 'claude' && hasDecided(CLAUDE_HOST)) {
    try { pending = null; return await claudeTurn(text, history); } catch (err) {
      const r = localKompas({ type: 'text', text });
      return { ...r, local: true, note: err?.code === 'not_granted' ? 'Claude gaf geen toestemming' : '' };
    }
  }
  if (provider.id === 'openai-compatible') return { html: await provider.reply(text, history), move: 'listen' };
  if (provider.id === 'claude') return { html: 'Kies eerst wat Claude mag zien (knop <b>Wat mag de AI zien?</b>). Er is niets verstuurd.', move: 'listen' };
  if (isShortQuestion(text)) { const core = localCoreReply(text); if (core) return { html: core, move: 'core' }; }
  return localKompas({ type: 'text', text });
}

/** Een gekozen knop (zes stuurkeuzes, kaarten, snelkeuzes, 💡-antwoorden). */
export async function kompasAction(id, payload, history = []) {
  if (id === 'quick') return kompasTurn(String(payload || ''), history);
  if (id.startsWith('r-')) return reflectionChoice(id);
  if (pending && id === 'disagree') return reflectionChoice('r-no');
  if (pending && id === 'skip') return reflectionChoice('r-skip');
  const provider = activeProvider();
  if (provider.id === 'claude' && hasDecided(CLAUDE_HOST) && choiceText(id)) {
    if (id === 'disagree') rejected = true;
    try { return await claudeTurn(choiceText(id), history); } catch (_) { return { ...localKompas({ type: 'action', id, payload }), local: true }; }
  }
  return localKompas({ type: 'action', id, payload });
}

function reflectionChoice(id) {
  const r = pending;
  pending = null;
  current = { actions: [], proposals: [] };
  if (!r) return { html: 'Vertel gerust verder.', move: 'listen' };
  const op = { 'r-confirm': { op: 'addPossibleThenConfirm', text: r.text, alternatives: r.alternatives, topics: [] }, 'r-maybe': { op: 'addPossible', text: r.text, alternatives: r.alternatives, topics: [] },
    'r-no': { op: 'noteRejectedPossible', text: r.text }, 'r-skip': { op: 'noteSkippedPossible', text: r.text } }[id];
  setMem(applyOps(mem(), [op]));
  if (id === 'r-no') rejected = true;
  return { html: esc({ 'r-confirm': 'Fijn. Ik zet het in je kompas — je kunt het daar altijd aanpassen of wissen.', 'r-maybe': 'Oké, ik bewaar het als open vraagteken, niet als feit.', 'r-no': 'Helder, dan zat ik ernaast. Ik laat het los.', 'r-skip': 'Prima, laten we verder gaan.' }[id]), move: 'listen', saved: id === 'r-confirm' ? 'insight' : id === 'r-maybe' ? 'possible' : null };
}

export const ACTION_LABEL = {
  deeper: '🔍 Dieper', angle: '🔄 Andere kant', switch: '🎲 Iets anders', practical: '🛠️ Praktisch', skip: '⏭️ Overslaan', disagree: '✋ Klopt niet',
  'r-confirm': '✅ Ja, dat klopt', 'r-maybe': '🤔 Misschien', 'r-no': '✋ Nee, klopt niet', 'r-skip': '🙈 Laat maar',
};
