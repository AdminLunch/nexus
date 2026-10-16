import { getState, update } from '../store.js';
import { esc, icons, haptic } from '../ui.js';
import { activeProvider } from '../ai/engine.js';

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
      <div class="ai-core" aria-hidden="true"></div>
      <div class="eyebrow">AI-assistent</div>
      <h1 class="page-title" style="font-size:24px">${esc(provider.name)}</h1>
      <p class="page-sub">${provider.id === 'local' ? 'Draait op je toestel · gratis · offline' : 'Eigen model via je endpoint'}</p>
    </section>

    <div class="suggest" id="suggest">${SUGGESTIONS.map((x) => `<button class="chip" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="stack-gap"></div>

    <div class="chat" id="chat" aria-live="polite">
      ${s.chat.length ? '' : `<div class="msg bot">Hoi${s.settings.name ? ' ' + esc(s.settings.name) : ''}! Ik ken je prioriteiten, slaap, stemming, training en doelen. Vraag me om een <b>samenvatting</b>, of typ <b>help</b>.</div>`}
      ${s.chat.map((m) => `<div class="msg ${m.role}">${m.role === 'user' ? esc(m.text) : m.text}</div>`).join('')}
      ${pending ? '<div class="msg bot typing" aria-label="Aan het nadenken"><i></i><i></i><i></i></div>' : ''}
    </div>
    ${s.chat.length ? '<button class="btn ghost sm" id="clear" style="margin:16px auto 0;display:block">Gesprek wissen</button>' : ''}

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
    if (q) ask(q);
  });
  el.querySelector('#suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) ask(b.dataset.q);
  });
  el.querySelector('#clear')?.addEventListener('click', () => {
    if (confirm('Gesprek wissen?')) update((st) => { st.chat = []; });
  });
}

async function ask(q) {
  if (pending) return;
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
