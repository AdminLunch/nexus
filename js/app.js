// NEXUS — app-shell: routing, rendering, instellingen, service worker.
import { load, subscribe, getState, update, today, exportJSON, importJSON, resetAll, loadDemo, isStorageOk, requestPersistence } from './store.js';
import { animateRings, openSheet, closeSheet, toast, esc } from './ui.js';
import { getProviders } from './ai/engine.js';
import * as home from './views/home.js';
import * as mind from './views/mind.js';
import * as body from './views/body.js';
import * as goals from './views/goals.js';
import * as ai from './views/ai.js';

const VIEWS = { home, mind, body, goals, ai };
const ORDER = ['home', 'mind', 'body', 'goals', 'ai'];
const viewEl = document.getElementById('view');
let current = null;
let lastDay = today();

function routeName() {
  const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  return VIEWS[r] ? r : 'home';
}

function render({ navigate = false } = {}) {
  const name = routeName();
  viewEl.classList.remove('enter', 'still', 'has-composer');
  void viewEl.offsetWidth; // herstart animaties
  viewEl.classList.add(navigate ? 'enter' : 'still');
  VIEWS[name].render(viewEl);
  animateRings(viewEl);
  if (navigate) {
    window.scrollTo(0, 0);
    current = name;
    updateTabs(name);
    document.title = name === 'home' ? 'NEXUS' : `NEXUS · ${name[0].toUpperCase()}${name.slice(1)}`;
  }
}

function updateTabs(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  const glow = document.querySelector('.tab-glow');
  glow.style.transform = `translateX(${ORDER.indexOf(name) * 100}%)`;
}

function tickClock() {
  const d = new Date();
  document.getElementById('clock').textContent = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  // Nieuwe dag terwijl de app openstaat? Opnieuw tekenen.
  const t = today();
  if (t !== lastDay) { lastDay = t; body.resetDraft(); render(); }
}

// ------------------------------------------------------------------
// Instellingen
// ------------------------------------------------------------------
function openSettings() {
  const s = getState().settings;
  const providers = getProviders();
  openSheet(`
    <h2>Instellingen</h2>
    <form id="settings-form" autocomplete="off">
      <div class="field"><label for="st-name">Je naam</label><input class="input" id="st-name" name="name" maxlength="30" value="${esc(s.name)}" placeholder="Voor de begroeting"></div>
      <div class="grid-2">
        <div class="field"><label for="st-sleep">Slaapdoel (uur)</label><input class="input" type="number" inputmode="decimal" step="0.5" min="4" max="12" id="st-sleep" name="sleepTarget" value="${s.sleepTarget}"></div>
        <div class="field"><label for="st-train">Training / week (min)</label><input class="input" type="number" inputmode="numeric" step="10" min="0" max="2000" id="st-train" name="weeklyTrainingTarget" value="${s.weeklyTrainingTarget}"></div>
      </div>

      <h3>AI-assistent</h3>
      <div class="field"><label for="st-ai">Model</label>
        <select class="select" id="st-ai" name="aiProvider">${providers.map((p) => `<option value="${p.id}" ${p.id === s.aiProvider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </div>
      <div id="ai-extra" style="display:${s.aiProvider === 'openai-compatible' ? 'block' : 'none'}">
        <p class="hint">Optioneel. Werkt met elke OpenAI-compatibele server, bijv. Ollama of LM Studio op je eigen computer (gratis). Je sleutel blijft alleen op dit toestel.</p>
        <div class="field"><label for="st-ep">Endpoint</label><input class="input" id="st-ep" name="aiEndpoint" value="${esc(s.aiEndpoint)}" placeholder="http://192.168.1.10:11434/v1" inputmode="url" autocapitalize="off"></div>
        <div class="field"><label for="st-model">Modelnaam</label><input class="input" id="st-model" name="aiModel" value="${esc(s.aiModel)}" placeholder="llama3.2" autocapitalize="off"></div>
        <div class="field"><label for="st-key">API-sleutel (optioneel)</label><input class="input" type="password" id="st-key" name="aiKey" value="${esc(s.aiKey)}" autocapitalize="off"></div>
      </div>
      <button class="btn block">Opslaan</button>
    </form>

    <h3>Gegevens</h3>
    <p class="hint">Alles staat alleen op dit toestel. Maak af en toe een back-up.</p>
    <div class="grid-2">
      <button class="btn ghost" id="st-export">Back-up maken</button>
      <label class="btn ghost" style="text-align:center">Herstellen<input type="file" accept="application/json,.json" id="st-import" hidden></label>
    </div>
    <div class="stack-gap"></div>
    <div class="grid-2">
      <button class="btn ghost" id="st-demo">Demo-data laden</button>
      <button class="btn danger" id="st-reset">Alles wissen</button>
    </div>
    <p class="hint" style="margin-top:18px;text-align:center">NEXUS v1.0 · lokaal · €0</p>
  `, (sheet) => {
    sheet.querySelector('#st-ai').addEventListener('change', (e) => {
      sheet.querySelector('#ai-extra').style.display = e.target.value === 'openai-compatible' ? 'block' : 'none';
    });
    sheet.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      update((st) => {
        Object.assign(st.settings, {
          name: f.name.value.trim(),
          sleepTarget: Math.max(4, Math.min(12, Number(f.sleepTarget.value) || 8)),
          weeklyTrainingTarget: Math.max(0, Number(f.weeklyTrainingTarget.value) || 150),
          aiProvider: f.aiProvider.value,
          aiEndpoint: f.aiEndpoint.value.trim(),
          aiModel: f.aiModel.value.trim(),
          aiKey: f.aiKey.value.trim(),
        });
      });
      closeSheet();
      toast('Instellingen opgeslagen');
    });
    sheet.querySelector('#st-export').addEventListener('click', exportBackup);
    sheet.querySelector('#st-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        importJSON(await file.text());
        body.resetDraft();
        closeSheet();
        toast('Back-up hersteld');
      } catch (err) { toast(`Herstellen mislukt: ${err.message}`); }
    });
    sheet.querySelector('#st-demo').addEventListener('click', () => {
      if (!confirm('Demo-data laden? Dit vervangt je huidige gegevens (je naam en instellingen blijven).')) return;
      loadDemo(); body.resetDraft(); closeSheet(); toast('Demo-data geladen');
    });
    sheet.querySelector('#st-reset').addEventListener('click', () => {
      if (!confirm('Alle NEXUS-gegevens op dit toestel wissen? Dit kan niet ongedaan worden.')) return;
      resetAll(); body.resetDraft(); closeSheet(); toast('Alles gewist');
    });
  });
}

async function exportBackup() {
  const json = exportJSON();
  const name = `nexus-backup-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // Op iPhone: deelmenu (opslaan in Bestanden, AirDrop, mail…)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'NEXUS back-up' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Back-up gedownload');
}

// ------------------------------------------------------------------
// Opstarten
// ------------------------------------------------------------------
load();
subscribe(() => render());
window.addEventListener('hashchange', () => { closeSheet(true); render({ navigate: true }); });
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

if (!location.hash) history.replaceState(null, '', '#/home');
render({ navigate: true });
tickClock();
setInterval(tickClock, 15000);

if (!isStorageOk()) toast('⚠️ Opslag niet beschikbaar — gegevens worden niet bewaard (privémodus?)');
requestPersistence();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW-registratie mislukt', e));
  });
}

// Handig om te debuggen vanuit de console
window.NEXUS = { getState, version: '1.0.0' };
