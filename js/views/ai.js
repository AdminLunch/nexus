import { getState, update } from '../store.js';
import { esc, safeHtml, icons, haptic, openSheet, closeSheet, toast, ask as confirmAsk } from '../ui.js';
import { activeProvider } from '../ai/engine.js';
import { AI_CATEGORIES, NEVER_SHARED, CATEGORY_IDS, activeHost, hasDecided, grantedScopes, setConsent, revokeAll, clearLog, buildAiRequest, CLAUDE_HOST } from '../privacy/consent.js';

const SUGGESTIONS = ['Samenvatting', 'Hoe slaap ik?', 'Waar moet ik op focussen?', 'Training', 'Gewoontes', 'Doelen', 'Help'];
let pending = false;

function addMessage(role, text) {
  update((st) => {
    st.chat.push({ role, text, t: Date.now() });
    if (st.chat.length > 120) st.chat = st.chat.slice(-120);
  });
}

export function render(el) {
  const s = getState();
  const provider = activeProvider();
  el.classList.add('has-composer');

  el.innerHTML = `
    <section class="page-head" style="text-align:center">
      <div class="ai-core-wrap${pending ? ' thinking' : ''}" aria-hidden="true"><i class="ai-orbit"></i><i class="ai-orbit o2"></i><div class="ai-core"></div></div>
      <div class="eyebrow">AI-assistent</div>
      <h1 class="page-title" style="font-size:24px">${esc(provider.name)}</h1>
      <p class="page-sub">${provider.id === 'claude' ? 'Via je Claude-account · alleen wat jij toestaat' : provider.external ? 'Eigen model via je endpoint' : 'Draait op je toestel · gratis · offline'}</p>
    </section>

    <div class="suggest" id="suggest">${SUGGESTIONS.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="stack-gap"></div>

    <div class="chat" id="chat" aria-live="polite">
      ${s.chat.length ? '' : provider.external
        ? `<div class="msg bot">Hoi! Je praat met ${provider.id === 'claude' ? 'Claude' : 'je eigen AI-model'}. Het ziet alleen je bericht en wat je onderaan bij <b>Wat mag de AI zien?</b> toestaat.</div>`
        : `<div class="msg bot">Hoi${s.settings.name ? ' ' + esc(s.settings.name) : ''}! Ik ken je prioriteiten, slaap, stemming, training en doelen — en blijf op dit toestel. Vraag me om een <b>samenvatting</b>, of typ <b>help</b>.</div>`}
      ${s.chat.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : 'bot'}">${m.role === 'user' ? esc(m.text) : safeHtml(m.text)}</div>`).join('')}
      ${pending ? '<div class="msg bot typing" aria-label="Aan het nadenken"><i></i><i></i><i></i></div>' : ''}
    </div>
    ${s.chat.length ? '<button class="btn ghost sm" id="clear" style="margin:16px auto 0;display:block">Gesprek wissen</button>' : ''}

    <div class="composer">
      ${shareStrip(provider)}
      <form id="composer" autocomplete="off">
        <input class="input" name="q" placeholder="Vraag NEXUS iets…" aria-label="Bericht" enterkeyhint="send">
        <button class="btn btn-square" aria-label="Verstuur" ${pending ? 'disabled' : ''}>${icons.send}</button>
      </form>
    </div>
  `;

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
    confirmAsk('Gesprek wissen?', { ok: 'Wissen', danger: true }).then((ok) => { if (ok) update((st) => { st.chat = []; }); });
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
  const history = [...getState().chat];
  pending = true;
  addMessage('user', q);
  const started = Date.now();
  let answer;
  try {
    answer = await activeProvider().reply(q, history);
  } catch (err) {
    answer = `⚠️ Kon geen antwoord ophalen: ${esc(err.message || err)}. Controleer je AI-instellingen of schakel terug naar NEXUS Core.`;
  }
  // korte "denkpauze" voor een natuurlijk gevoel
  const wait = Math.max(0, 450 - (Date.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  pending = false;
  addMessage('bot', answer);
}
