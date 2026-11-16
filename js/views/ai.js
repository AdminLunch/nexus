import { getState, update } from '../store.js';
import { esc, safeHtml, icons, haptic, openSheet, closeSheet, toast, ask as confirmAsk } from '../ui.js';
import { activeProvider } from '../ai/engine.js';
import { kompasTurn, kompasAction, kompasState, ensureSession, resetKompasSession, ACTION_LABEL } from '../kompas-chat.js';
import { applyOps, proposalToOp, CORE_ACTIONS } from '../kompas/index.js';
import { inClaude } from '../cloud.js';
import { AI_CATEGORIES, NEVER_SHARED, CATEGORY_IDS, activeHost, hasDecided, grantedScopes, setConsent, revokeAll, clearLog, buildAiRequest, CLAUDE_HOST } from '../privacy/consent.js';

const SUGGESTIONS = ['Samenvatting', 'Hoe slaap ik?', 'Waar moet ik op focussen?', 'Training', 'Gewoontes', 'Doelen', 'Help'];
let pending = false;
let intro = null; // openingsbeurt van het Kompas (pas opgeslagen bij de eerste interactie)

const CTX_ICON = { 'intro-why': '👋', 'intro-free': '🌱', 'intro-unsure': '🤷', practical: '🛠️', 'intro-how': '🔒', 'open-door': '🎲', 'reflection-confirm': '✅', 'reflection-maybe': '🤔',
  disagree: '✋', skip: '🙈', 'review-still': '✅', 'review-outdated': '🕰️', 'review-later': '⏳', 'recall-interest': '✨', 'tool-start': '📝', 'tools-off': '🚫', angle: '🔄', switch: '🎲',
  quick: '💬', 'r-confirm': '✅', 'r-maybe': '🤔', 'r-no': '✋', 'r-skip': '🙈' };
const CORE_ICON = { deeper: ['🔍', 'Dieper'], angle: ['🔄', 'Andere kant'], switch: ['🎲', 'Iets anders'], practical: ['🛠️', 'Praktisch'], skip: ['⏭️', 'Overslaan'], disagree: ['✋', 'Klopt niet'] };
const MOVE_TAG = { reflect: '💡 Mogelijk verband · onbevestigd', safety: '💗 Even stilstaan', review: '🕰️ Klopt dit nog?', recall: '↩️ Eerder verteld' };
const LAYER_NAME = { told: 'iets wat je vertelde', value: 'iets wat je belangrijk vindt', interest: 'een interesse' };

function addMessage(role, text, extra = {}) {
  update((st) => {
    st.chat.push({ role, text, t: Date.now(), ...extra });
    if (st.chat.length > 120) st.chat = st.chat.slice(-120);
  });
}
function keepIntro() {
  if (intro && !getState().chat.length) addMessage('bot', esc(intro.text), { move: 'intro' });
  intro = null;
}

export function render(el) {
  const s = getState();
  const provider = activeProvider();
  el.classList.add('has-composer');
  if (!s.chat.length && !intro) intro = ensureSession() || null;
  const kp = kompasState();
  const needClaudeConsent = provider.id === 'claude' && !hasDecided(CLAUDE_HOST);

  el.innerHTML = `
    <div class="kp-topline">
      <span class="eyebrow">Gesprek</span>
      ${inClaude() ? `<button class="kp-chip ${provider.id === 'claude' ? 'on' : ''}" id="kp-ai">${provider.id === 'claude' ? '🧠 Claude' : '🔧 Lokaal'}</button>` : `<span class="card-note">${esc(provider.name)}</span>`}
    </div>
    ${needClaudeConsent ? `<div class="kp-consent">
      <b>🧠 Wil je dat Claude dit gesprek voert?</b>
      <p>Dan klinkt het veel natuurlijker. Alleen dit gesprek en wat er in <b>Mijn Kompas</b> staat (onbevestigde dingen als onbevestigd) gaan naar Claude, via je eigen Claude-account. Andere gegevens alleen als je dat zelf aanzet. NEXUS blijft controleren op labels en stellige conclusies en bewaart niets zonder jouw tik.</p>
      <div class="kp-row"><button class="btn sm" id="kp-consent-yes">Ja, praat met Claude</button><button class="btn ghost sm" id="kp-consent-pick">Zelf kiezen</button><button class="btn ghost sm" id="kp-consent-local">Nee, lokaal</button></div>
    </div>` : ''}

    <div class="chat" id="chat" aria-live="polite">
      ${!s.chat.length && intro ? `<div class="msg bot intro">${esc(intro.text)}</div>` : ''}
      ${s.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'} ${m.move ? esc('mv-' + m.move) : ''}">${m.role === 'bot' && MOVE_TAG[m.move] ? `<span class="kp-tag">${esc(MOVE_TAG[m.move])}</span>` : ''}${m.role === 'user' ? esc(m.text) : safeHtml(m.text)}</div>`).join('')}
      ${pending ? '<div class="msg bot typing" aria-label="Aan het nadenken"><i></i><i></i><i></i></div>' : ''}
    </div>

    <div class="kp-cards" id="kp-cards">${pending ? '' : kp.actions.map((a, i) => `<button class="kp-card" data-kp="${i}"><span class="e">${CTX_ICON[a.id] || '✦'}</span><b>${esc(a.label)}</b></button>`).join('')}</div>
    <div id="kp-proposals">${kp.proposals.map((p, i) => `<div class="kp-proposal"><span>✨ Bewaren als <b>${esc(LAYER_NAME[p.type] || 'iets wat je vertelde')}</b>?<br>“${esc(p.text)}”</span>
      <button class="btn sm" data-kp-accept="${i}">📌 Bewaar</button><button class="btn ghost sm" data-kp-dismiss="${i}">Nee</button></div>`).join('')}</div>
    <div class="kp-joystick" id="kp-core">${CORE_ACTIONS.map((a) => `<button class="kp-joy" data-core="${a.id}" aria-label="${esc(a.label)}"><span class="ic">${CORE_ICON[a.id][0]}</span>${esc(CORE_ICON[a.id][1])}</button>`).join('')}</div>
    <div class="suggest" id="suggest">${SUGGESTIONS.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    ${s.chat.length ? '<button class="btn ghost sm" id="clear" style="margin:16px auto 0;display:block">Gesprek wissen</button>' : ''}

    <div class="composer">
      ${shareStrip(provider)}
      <form id="composer" autocomplete="off">
        <input class="input" name="q" placeholder="Vertel maar, of vraag iets…" aria-label="Bericht" enterkeyhint="send">
        <button class="btn btn-square" aria-label="Verstuur" ${pending ? 'disabled' : ''}>${icons.send}</button>
      </form>
    </div>
  `;

  el.querySelector('#kp-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kp]'); if (!b) return;
    const a = kp.actions[Number(b.dataset.kp)]; if (a) act(a.id, a.payload, a.label);
  });
  el.querySelector('#kp-core').addEventListener('click', (e) => {
    const b = e.target.closest('[data-core]'); if (!b) return;
    if (b.dataset.core === 'switch') { b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll'); }
    act(b.dataset.core);
  });
  el.querySelector('#kp-proposals').addEventListener('click', (e) => {
    const acc = e.target.closest('[data-kp-accept]');
    const dis = e.target.closest('[data-kp-dismiss]');
    if (acc) { const p = kp.proposals[Number(acc.dataset.kpAccept)]; kp.proposals.splice(Number(acc.dataset.kpAccept), 1); update((st) => { st.kompas = applyOps(st.kompas, [proposalToOp(p)]); }); toast('📌 Bewaard in je kompas'); }
    if (dis) { kp.proposals.splice(Number(dis.dataset.kpDismiss), 1); update(() => {}, { silent: false }); }
  });
  el.querySelector('#kp-ai')?.addEventListener('click', () => update((st) => { st.settings.aiProvider = st.settings.aiProvider === 'claude' ? 'local' : 'claude'; }));
  el.querySelector('#kp-consent-yes')?.addEventListener('click', () => { setConsent({ ...grantedScopes(CLAUDE_HOST), history: true, kompas: true }, CLAUDE_HOST); toast('Claude voert nu het gesprek'); });
  el.querySelector('#kp-consent-pick')?.addEventListener('click', () => openConsentSheet());
  el.querySelector('#kp-consent-local')?.addEventListener('click', () => update((st) => { st.settings.aiProvider = 'local'; }));

  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  el.querySelector('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) ask(q);
  });
  el.querySelector('#suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) ask(b.dataset.q);
  });
  el.querySelector('#clear')?.addEventListener('click', () => {
    confirmAsk('Gesprek wissen? Wat in je kompas staat blijft bewaard.', { ok: 'Wissen', danger: true }).then((ok) => { if (ok) { resetKompasSession(); intro = null; update((st) => { st.chat = []; }); } });
  });
  el.querySelector('#share-edit')?.addEventListener('click', () => openConsentSheet());
  el.querySelector('#share-view')?.addEventListener('click', () => openSharePreview(el.querySelector('#composer .input')?.value || ''));
}

// ------------------------------------------------------------------
// Wat er gedeeld wordt (alleen bij een extern model)
// ------------------------------------------------------------------
const catLabel = (id) => AI_CATEGORIES.find((c) => c.id === id)?.label || id;

function shareStrip(provider) {
  if (!provider.external) return '<div class="share-strip" id="share-strip"><span>🔒 Lokaal · er verlaat niets je toestel</span></div>';
  const host = activeHost();
  if (!host || !hasDecided(host)) {
    return `<div class="share-strip warn" id="share-strip"><span>Nog niet gekozen wat ${host ? esc(host) : 'de AI'} mag zien — er gaat niets weg.</span><button type="button" id="share-edit">Kiezen</button></div>`;
  }
  const on = CATEGORY_IDS.filter((id) => grantedScopes(host)[id]);
  return `<div class="share-strip" id="share-strip"><span>Deelt met <b>${esc(host)}</b>: ${on.length ? on.map((id) => esc(catLabel(id))).join(' · ') : 'alleen je bericht'}</span>
    <button type="button" id="share-view">Bekijk</button><button type="button" id="share-edit">Wijzig</button></div>`;
}

/** Keuze per categorie. Alles staat uit tot de gebruiker iets aanzet. */
export function openConsentSheet(pendingQuestion = null) {
  const s = getState();
  const host = activeHost();
  const decided = hasDecided(host);
  const scopes = grantedScopes(host);
  const log = s.privacy.aiLog.slice(0, 8);
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  openSheet(`
    <h2>Wat mag de AI zien?</h2>
    <p class="hint">${host === CLAUDE_HOST ? 'Je praat met <b>Claude</b> via je eigen Claude-account.' : `Je eigen AI-model draait op <b>${esc(host || 'een nog niet ingesteld adres')}</b>.`} Kies per onderdeel wat NEXUS bij elke vraag meestuurt. Alles staat standaard uit; je kunt het altijd weer uitzetten.</p>
    <form id="consent-form">
      ${AI_CATEGORIES.map((c) => `<label class="consent-row"><input type="checkbox" name="${c.id}" ${scopes[c.id] ? 'checked' : ''}>
        <span><b>${esc(c.label)}</b><small>${esc(c.desc)}</small></span></label>`).join('')}
      <p class="hint" style="margin-top:12px"><b>Nooit gedeeld:</b> ${NEVER_SHARED.map(esc).join(' · ')}.</p>
      <p class="hint">${host === CLAUDE_HOST ? 'Wat Claude met je bericht doet, valt onder de voorwaarden van je Claude-account.' : 'Wat de server met je gegevens doet (bewaren, loggen), bepaalt de beheerder van die server — bij een eigen Ollama/LM Studio ben jij dat zelf.'}</p>
      <button class="btn block" id="consent-save">Keuze opslaan</button>
      <button type="button" class="btn ghost block" id="consent-none" style="margin-top:8px">Niets delen, alleen mijn bericht</button>
    </form>
    ${decided ? '<button type="button" class="btn ghost sm" id="consent-preview" style="margin-top:12px">Bekijk precies wat er gaat</button>' : ''}
    <h3>Logboek</h3>
    <p class="hint">Wanneer er iets naar de AI ging en welke onderdelen — nooit de inhoud. Alleen op dit toestel.</p>
    ${log.length ? `<div id="consent-log">${log.map((e) => `<div class="restore-row"><span><b>${esc(e.host)}</b><small>${esc(when(e.t))} · ${e.categories.length ? e.categories.map((c) => esc(catLabel(c))).join(', ') : 'alleen bericht'}</small></span></div>`).join('')}</div>
      <button type="button" class="btn ghost sm" id="consent-clear-log" style="margin-top:10px">Logboek wissen</button>` : '<div class="empty">Nog niets gedeeld.</div>'}
  `, (sheet) => {
    const finish = (sc, msg) => {
      setConsent(sc, host);
      closeSheet();
      toast(msg);
      if (pendingQuestion) ask(pendingQuestion);
    };
    sheet.querySelector('#consent-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const sc = Object.fromEntries(CATEGORY_IDS.map((id) => [id, !!f[id]?.checked]));
      finish(sc, Object.values(sc).some(Boolean) ? 'Keuze opgeslagen' : 'Er wordt alleen je bericht gedeeld');
    });
    sheet.querySelector('#consent-none').addEventListener('click', () => {
      if (decided) { revokeAll(host); closeSheet(); toast('Delen uitgezet — alleen je bericht'); if (pendingQuestion) ask(pendingQuestion); return; }
      finish({}, 'Er wordt alleen je bericht gedeeld');
    });
    sheet.querySelector('#consent-preview')?.addEventListener('click', () => openSharePreview(''));
    sheet.querySelector('#consent-clear-log')?.addEventListener('click', () => {
      confirmAsk('Logboek wissen?', { ok: 'Wissen', danger: true }).then((ok) => { if (ok) { clearLog(); closeSheet(); toast('Logboek gewist'); } });
    });
  });
}

/** Exact het verzoek dat naar de server gaat (zonder API-sleutel). */
function openSharePreview(draft) {
  const req = buildAiRequest(draft || '(jouw bericht)', getState().chat, grantedScopes());
  openSheet(`
    <h2>Dit gaat naar ${esc(activeHost() || 'de AI')}</h2>
    <p class="hint">Bij je volgende vraag stuurt NEXUS precies dit (de API-sleutel staat er niet in). ${req.shared.historyCount ? `Inclusief ${req.shared.historyCount} eerdere berichten.` : 'Zonder eerdere berichten.'}</p>
    <pre class="share-preview" id="share-preview">${esc(JSON.stringify(req.messages, null, 2))}</pre>
    <button type="button" class="btn ghost block" id="preview-edit">Wijzig wat er gedeeld wordt</button>
  `, (sheet) => sheet.querySelector('#preview-edit').addEventListener('click', () => openConsentSheet()));
}

async function ask(q) {
  if (pending) return;
  // Extern model zonder keuze voor deze server: eerst vragen, er gaat nog niets weg.
  if (activeProvider().external && activeHost() && !hasDecided()) { openConsentSheet(q); return; }
  haptic(8);
  keepIntro();
  const history = [...getState().chat];
  pending = true;
  addMessage('user', q);
  await reply(() => kompasTurn(q, history));
}

/** Een gekozen knop (kaart, stuurknop, 💡-antwoord, snelkeuze). */
async function act(id, payload, label) {
  if (pending) return;
  haptic(6);
  keepIntro();
  const history = [...getState().chat];
  pending = true;
  addMessage('user', id === 'quick' ? String(payload) : (ACTION_LABEL[id] || `${CTX_ICON[id] || '✦'} ${label || id}`), { action: id !== 'quick' });
  await reply(() => kompasAction(id, payload, history));
}

async function reply(fn) {
  const started = Date.now();
  let res;
  try {
    res = await fn();
  } catch (err) {
    res = { html: `⚠️ Kon geen antwoord ophalen: ${esc(err.message || err)}. Controleer je AI-instellingen of schakel terug naar NEXUS Core.` };
  }
  const wait = Math.max(0, 450 - (Date.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  pending = false;
  addMessage('bot', `${res.html}${res.local ? '<br><i>(lokale terugval)</i>' : ''}`, res.move ? { move: res.move } : {});
  if (res.extra) addMessage('bot', res.extra.html, { move: res.extra.move });
  if (res.saved) toast(res.saved === 'insight' ? '🌿 In je kompas gezet' : '❓ Bewaard als open vraagteken');
}
