import { getState, update } from '../store.js';
import { esc, icons, haptic, ask } from '../ui.js';
import { activeProvider, getProviders } from '../ai/engine.js';

const SUGGESTIONS = ['Samenvatting', 'Weekrapport', 'Wat heb ik deze week gegeten?', 'Welke maaltijden sla ik over?', 'Welke voedingspatronen vallen op?', 'Wat kan ik morgen beter plannen?', 'Hoe slaap ik?', 'Waar moet ik op focussen?', 'Eiwit- en vezelrijk eten', 'Gewoontes', 'Doelen'];
let pending = false;
let liveText = '';
let provider = getProviders().find((p) => p.id === 'local');
let viewEl = null;

function addMessage(role, text) {
  update((st) => {
    st.chat.push({ role, text, t: Date.now() });
    if (st.chat.length > 120) st.chat = st.chat.slice(-120);
  });
}

/** Controleer (async) welke provider echt beschikbaar is en teken opnieuw bij een wijziging. */
async function refreshProvider() {
  const p = await activeProvider();
  if (p !== provider) {
    provider = p;
    if (viewEl && viewEl.isConnected && location.hash.replace('#', '') === 'ai') render(viewEl);
  }
}

export function render(el) {
  viewEl = el;
  const s = getState();
  refreshProvider();

  el.innerHTML = `
    <section class="page-head" style="text-align:center">
      <div class="ai-core" aria-hidden="true"></div>
      <div class="eyebrow">AI-assistent</div>
      <h1 class="page-title" style="font-size:24px">${esc(provider.name)}</h1>
      <p class="page-sub">${esc(provider.sub)}</p>
    </section>

    <div class="suggest" id="suggest">${SUGGESTIONS.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="stack-gap"></div>

    <div class="chat" id="chat" aria-live="polite">
      ${s.chat.length ? '' : `<div class="msg bot">Hoi${s.settings.name ? ' ' + esc(s.settings.name) : ''}! Ik ken je prioriteiten, slaap, stemming, training en doelen. Vraag me om een <b>samenvatting</b>, of stel gewoon je vraag.</div>`}
      ${s.chat.map((m) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text) : m.text}</div>`).join('')}
      ${pending ? (liveText ? `<div class="msg bot" id="live">${liveText}</div>` : '<div class="msg bot typing" id="live" aria-label="Aan het nadenken"><i></i><i></i><i></i></div>') : ''}
    </div>
    ${s.chat.length && !pending ? '<button class="btn ghost sm" id="clear" style="margin:16px auto 0;display:block">Gesprek wissen</button>' : ''}

    <div class="composer">
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
    if (q) send(q);
  });
  el.querySelector('#suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) send(b.dataset.q);
  });
  el.querySelector('#clear')?.addEventListener('click', async () => {
    if (await ask('Gesprek wissen?', { ok: 'Wissen', danger: true })) update((st) => { st.chat = []; });
  });
}

async function send(q) {
  if (pending) return;
  haptic(8);
  const history = [...getState().chat];
  pending = true;
  liveText = '';
  addMessage('user', q);
  const started = Date.now();
  let answer;
  const p = await activeProvider();
  try {
    answer = await p.reply(q, history, {
      onText: (html) => {
        liveText = html;
        const live = document.getElementById('live');
        if (live) {
          live.classList.remove('typing');
          live.removeAttribute('aria-label');
          live.innerHTML = html;
        }
      },
    });
  } catch (err) {
    answer = `⚠️ ${esc(err.message || err)}.`;
    if (p.id !== 'local') {
      try {
        const fallback = getProviders().find((x) => x.id === 'local');
        answer += '\n\n' + (await fallback.reply(q, history));
      } catch (_) { /* */ }
    }
  }
  // korte "denkpauze" voor een natuurlijk gevoel
  const wait = Math.max(0, 450 - (Date.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  pending = false;
  liveText = '';
  addMessage('bot', answer);
  refreshProvider();
}
