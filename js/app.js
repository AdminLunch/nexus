// NEXUS — app-shell: routing, rendering, instellingen, cloud-sync.
import { load, subscribe, getState, update, today, exportJSON, importJSON, resetAll, loadDemo, isStorageOk, setRemoteSaver, adoptRemote } from './store.js';
import { animateRings, openSheet, closeSheet, toast, esc, ask } from './ui.js';
import { getProviders } from './ai/engine.js';
import * as home from './views/home.js';
import * as mind from './views/mind.js';
import * as body from './views/body.js';
import * as goals from './views/goals.js';
import * as ai from './views/ai.js';

const VIEWS = { home, mind, body, goals, ai };
const ORDER = ['home', 'mind', 'body', 'goals', 'ai'];
const viewEl = document.getElementById('view');
let lastDay = today();

function routeName() {
  const r = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return VIEWS[r] ? r : 'home';
}

function render({ navigate = false } = {}) {
  const name = routeName();
  // Niet opnieuw tekenen terwijl iemand in een tekstveld van de pagina typt
  // (behalve bij navigatie): dat zou de cursor wegnemen.
  viewEl.classList.remove('enter', 'still');
  void viewEl.offsetWidth; // herstart animaties
  viewEl.classList.add(navigate ? 'enter' : 'still');
  const y = window.scrollY;
  VIEWS[name].render(viewEl);
  animateRings(viewEl);
  if (navigate) {
    window.scrollTo(0, 0);
    updateTabs(name);
  } else if (name !== 'ai') {
    window.scrollTo(0, y);
  }
}

function updateTabs(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  document.querySelector('.tab-glow').style.transform = `translateX(${ORDER.indexOf(name) * 100}%)`;
}

function tickClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  // Nieuwe dag terwijl de app openstaat? Opnieuw tekenen.
  const t = today();
  if (t !== lastDay) { lastDay = t; body.resetDraft(); render(); }
}

// ------------------------------------------------------------------
// Cloud-sync: privé opslag in je Claude-account (alleen jij kunt erbij).
// ------------------------------------------------------------------
const cloud = { ref: null, writing: false, dirty: false, timer: null, status: 'off' };
const SYNC_LABEL = { ok: 'Gesynchroniseerd met je Claude-account', busy: 'Bezig met opslaan…', off: 'Alleen op dit toestel opgeslagen', err: 'Synchroniseren mislukt — opgeslagen op dit toestel' };

function setSync(s) {
  cloud.status = s;
  const el = document.getElementById('sync');
  el.dataset.s = s;
  el.setAttribute('aria-label', SYNC_LABEL[s]);
  el.title = SYNC_LABEL[s];
}

function readSnap(snap) {
  if (!snap) return null;
  if (snap.exists === false) return null;
  const d = typeof snap.data === 'function' ? snap.data() : (snap.data !== undefined ? snap.data : snap);
  return d && typeof d === 'object' && 'json' in d ? d : null;
}

async function writeCloud() {
  if (!cloud.ref) return;
  if (cloud.writing) { cloud.dirty = true; return; }
  cloud.writing = true;
  cloud.dirty = false;
  setSync('busy');
  try {
    const s = getState();
    await cloud.ref.set({ json: JSON.stringify(s), updatedAt: s.updatedAt });
    setSync('ok');
  } catch (e) {
    console.warn('NEXUS: cloud-opslag mislukt', e);
    setSync('err');
  } finally {
    cloud.writing = false;
    if (cloud.dirty) writeCloud();
  }
}

function scheduleCloud() {
  if (!cloud.ref) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(writeCloud, 900);
}

async function pullCloud() {
  if (!cloud.ref) return;
  const remote = readSnap(await cloud.ref.get());
  const local = getState();
  if (remote && Number(remote.updatedAt) > (local.updatedAt || 0)) {
    adoptRemote(JSON.parse(remote.json));
    body.resetDraft();
    render();
  } else if (local.updatedAt > (remote ? Number(remote.updatedAt) : 0)) {
    await writeCloud();
  }
  setSync('ok');
}

async function initCloud() {
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return setSync('off');
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return setSync('off');
    const id = await user.id();
    if (!id) return setSync('off');
    cloud.ref = db.collection('data/users/' + id).doc('nexus');
    setSync('busy');
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000));
    await Promise.race([pullCloud(), timeout]);
    setRemoteSaver(scheduleCloud);
    // Terug naar de app (bijv. na gebruik op een ander toestel)? Even verversen.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !cloud.writing && !document.activeElement?.matches('input, textarea')) pullCloud().catch(() => setSync('err'));
    });
  } catch (e) {
    console.warn('NEXUS: cloud niet beschikbaar', e);
    // Lokaal blijft werken; probeer later opnieuw te schrijven als de ref er is.
    if (cloud.ref) setRemoteSaver(scheduleCloud);
    setSync(cloud.ref ? 'err' : 'off');
  }
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
        <div class="field"><label for="st-train">Training/week (min)</label><input class="input" type="number" inputmode="numeric" step="10" min="0" max="2000" id="st-train" name="weeklyTrainingTarget" value="${s.weeklyTrainingTarget}"></div>
      </div>
      <div class="field"><label for="st-water">Waterdoel (glazen per dag)</label><input class="input" type="number" inputmode="numeric" step="1" min="1" max="20" id="st-water" name="waterTarget" value="${s.waterTarget || 8}"></div>
      <div class="field"><label for="st-ai">AI-assistent</label>
        <select class="select" id="st-ai" name="aiProvider">${providers.map((p) => `<option value="${p.id}" ${p.id === s.aiProvider ? 'selected' : ''}>${esc(p.name)} — ${esc(p.sub)}</option>`).join('')}</select>
      </div>
      <button class="btn block">Opslaan</button>
    </form>

    <h3>Gegevens</h3>
    <p class="hint">${esc(SYNC_LABEL[cloud.status])}. Een back-up is extra zekerheid.</p>
    <div class="grid-2">
      <button class="btn ghost" id="st-export">Back-up maken</button>
      <label class="btn ghost" style="text-align:center">Herstellen<input type="file" accept="application/json,.json,text/plain" id="st-import" hidden></label>
    </div>
    <button class="btn ghost sm block" id="st-paste" style="margin-top:8px">Herstel uit geplakte tekst</button>
    <div id="backup-box" hidden style="margin-top:12px">
      <p class="hint">Kopieer deze tekst en bewaar hem (bijv. in Notities). Plak hem later hieronder om te herstellen.</p>
      <textarea class="textarea" id="backup-text" style="min-height:90px;font-family:var(--mono);font-size:12px"></textarea>
      <div class="grid-2" style="margin-top:8px">
        <button class="btn ghost sm" id="backup-copy">Kopiëren</button>
        <button class="btn ghost sm" id="backup-restore">Herstel uit tekst</button>
      </div>
    </div>
    <div class="stack-gap"></div>
    <div class="grid-2">
      <button class="btn ghost" id="st-demo">Demo-data laden</button>
      <button class="btn danger" id="st-reset">Alles wissen</button>
    </div>
    <p class="hint" style="margin-top:18px;text-align:center">NEXUS v1.2 · €0</p>
  `, (sheet) => {
    sheet.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      update((st) => {
        Object.assign(st.settings, {
          name: f.querySelector('[name="name"]').value.trim(),
          sleepTarget: Math.max(4, Math.min(12, Number(f.sleepTarget.value) || 8)),
          weeklyTrainingTarget: Math.max(0, Number(f.weeklyTrainingTarget.value) || 150),
          waterTarget: Math.max(1, Math.min(20, Math.round(Number(f.waterTarget.value) || 8))),
          aiProvider: f.aiProvider.value,
        });
      });
      closeSheet();
      toast('Instellingen opgeslagen');
    });

    const box = sheet.querySelector('#backup-box');
    const showBox = (fill) => { box.hidden = false; if (fill) sheet.querySelector('#backup-text').value = exportJSON(); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    sheet.querySelector('#st-export').addEventListener('click', async () => {
      const dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads').catch(() => null) : null;
      if (dl) {
        try {
          await dl.save({ filename: `nexus-backup-${today()}.json`, data: exportJSON() });
          toast('Back-up opgeslagen');
          return;
        } catch (_) { /* geweigerd of niet mogelijk: toon tekst */ }
      }
      showBox(true);
    });
    sheet.querySelector('#backup-copy').addEventListener('click', async () => {
      const ta = sheet.querySelector('#backup-text');
      try { await navigator.clipboard.writeText(ta.value); toast('Gekopieerd'); }
      catch (_) { ta.select(); toast('Selecteer en kopieer de tekst handmatig'); }
    });
    const restore = async (text) => {
      try {
        if (!(await ask('Back-up herstellen? Dit vervangt je huidige gegevens.', { ok: 'Herstellen' }))) return;
        importJSON(text);
        body.resetDraft();
        closeSheet();
        toast('Back-up hersteld');
      } catch (err) { toast(`Herstellen mislukt: ${err.message}`); }
    };
    sheet.querySelector('#backup-restore').addEventListener('click', () => restore(sheet.querySelector('#backup-text').value));
    sheet.querySelector('#st-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) restore(await file.text());
      e.target.value = '';
    });
    sheet.querySelector('#st-paste').addEventListener('click', () => { sheet.querySelector('#backup-text').value = ''; showBox(false); sheet.querySelector('#backup-text').focus(); });

    sheet.querySelector('#st-demo').addEventListener('click', async () => {
      if (!(await ask('Demo-data laden? Dit vervangt je huidige gegevens (naam en instellingen blijven).', { ok: 'Laden' }))) return;
      loadDemo(); body.resetDraft(); closeSheet(); toast('Demo-data geladen');
    });
    sheet.querySelector('#st-reset').addEventListener('click', async () => {
      if (!(await ask('Alle NEXUS-gegevens wissen? Dit kan niet ongedaan worden.', { ok: 'Alles wissen', danger: true }))) return;
      resetAll(); body.resetDraft(); closeSheet(); toast('Alles gewist');
    });
  });
}

// ------------------------------------------------------------------
// Opstarten
// ------------------------------------------------------------------
load();
subscribe(() => render());
window.addEventListener('hashchange', () => { closeSheet(true); render({ navigate: true }); });
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

render({ navigate: true });
tickClock();
setInterval(tickClock, 15000);
if (!isStorageOk()) toast('Browseropslag niet beschikbaar — NEXUS gebruikt je Claude-account');
initCloud();

// Handig om te debuggen vanuit de console
window.NEXUS = { getState, version: '1.2.0' };
