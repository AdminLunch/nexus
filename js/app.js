// NEXUS — app-shell: routing, rendering, instellingen, service worker, optionele synchronisatie.
// Eén broncode voor de PWA én het Claude-artifact. Routes zijn gewone #namen (#home, #mind, …)
// omdat een Claude-artifact alleen die doorgeeft; oude links met #/naam blijven werken.
export const VERSION = '1.4.0-dev';
import { load, subscribe, getState, update, today, exportJSON, importJSON, readBackup, MAX_BACKUP_BYTES, resetAll, loadDemo, isStorageOk, requestPersistence, createRestorePoint, restorePoints, restoreFrom, clearRestorePoints, MAX_RESTORE_POINTS } from './store.js';
import { encryptText, decryptText, isEncryptedBackup, MIN_PASSWORD } from './crypto.js';
import { animateRings, openSheet, closeSheet, toast, esc, initRipples, reducedMotion, ask } from './ui.js';
import { initCloud, stopCloud, inClaude, syncStatus, SYNC_LABEL, deleteCloudCopy } from './cloud.js';
import { getProviders } from './ai/engine.js';
import * as home from './views/home.js';
import * as mind from './views/mind.js';
import * as body from './views/body.js';
import * as goals from './views/goals.js';
import * as ai from './views/ai.js';
import * as kompas from './views/kompas.js';

const VIEWS = { home, mind, kompas, body, goals };
const ORDER = ['home', 'mind', 'kompas', 'body', 'goals'];
const viewEl = document.getElementById('view');
let current = null;
let lastDay = today();

function routeName() {
  const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  if (r === 'ai') { kompas.setKompasTab('gesprek'); return 'kompas'; } // oude links en bladwijzers
  return VIEWS[r] ? r : 'home';
}

let leaveTimer = null;

/** Paginawissel: oude pagina kort laten wegglijden, nieuwe vanaf de andere kant binnen. */
function navigate() {
  const name = routeName();
  const from = current;
  const dir = from && ORDER.indexOf(name) < ORDER.indexOf(from) ? -1 : 1;
  viewEl.style.setProperty('--dir', dir);
  updateTabs(name); // tab-highlight beweegt meteen mee
  clearTimeout(leaveTimer);
  if (!from || from === name || reducedMotion()) { viewEl.classList.remove('leaving'); render({ navigate: true }); return; }
  viewEl.classList.add('leaving');
  leaveTimer = setTimeout(() => { viewEl.classList.remove('leaving'); render({ navigate: true }); }, 150);
}

function render({ navigate = false } = {}) {
  const name = routeName();
  // Tijdens het wegglijden niet tussendoor de oude pagina opnieuw tekenen.
  if (!navigate && viewEl.classList.contains('leaving')) return;
  viewEl.classList.remove('enter', 'still', 'has-composer');
  void viewEl.offsetWidth; // herstart animaties
  viewEl.classList.add(navigate ? 'enter' : 'still');
  try {
    VIEWS[name].render(viewEl);
  } catch (err) {
    // Nooit een leeg scherm: toon wat er misging, met een uitweg. Gegevens blijven ongemoeid.
    console.error('NEXUS: scherm kon niet worden getekend', err);
    window.__nexusRenderError = `${name}: ${err?.message || err}`;
    viewEl.innerHTML = `<section class="card" style="margin-top:24px"><h2 class="card-title">Dit scherm lukt even niet</h2>
      <p class="hint">Je gegevens zijn niet aangetast. Probeer een ander scherm of laad opnieuw.</p>
      <pre class="share-preview">${esc(window.__nexusRenderError)}</pre>
      <div class="grid-2"><button class="btn ghost" id="err-home">Naar Vandaag</button><button class="btn" id="err-reload">Opnieuw laden</button></div></section>`;
    viewEl.querySelector('#err-home').addEventListener('click', () => { location.hash = name === 'home' ? 'kompas' : 'home'; });
    viewEl.querySelector('#err-reload').addEventListener('click', () => location.reload());
  }
  window.__nexusStarted = true;
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
      <div class="grid-3">
        <div class="field"><label for="st-kcal">kcal / dag</label><input class="input" type="number" inputmode="numeric" step="50" min="800" max="6000" id="st-kcal" name="kcalTarget" value="${s.kcalTarget}"></div>
        <div class="field"><label for="st-prot">Eiwit (g)</label><input class="input" type="number" inputmode="numeric" step="5" min="0" max="400" id="st-prot" name="proteinTarget" value="${s.proteinTarget}"></div>
        <div class="field"><label for="st-water">Water (glazen)</label><input class="input" type="number" inputmode="numeric" step="1" min="1" max="20" id="st-water" name="waterTarget" value="${s.waterTarget}"></div>
      </div>
      <label class="check-line"><input type="checkbox" name="trackKcal" ${s.trackKcal ? 'checked' : ''}> Calorieën en macro's bijhouden (optioneel)</label>
      <p class="hint" style="margin-top:-6px">Uit: je registreert alleen eetmomenten en bouwstenen. Aan: per maaltijd kun je kcal en macro's invullen; de richtwaarden hierboven gelden dan.</p>

      <div class="field"><label for="st-start">Startscherm</label>
        <select class="select" id="st-start" name="startView">
          <option value="kompas" ${s.startView !== 'home' ? 'selected' : ''}>🧭 Kompas</option>
          <option value="home" ${s.startView === 'home' ? 'selected' : ''}>☀️ Vandaag</option>
        </select>
      </div>

      <h3>AI-assistent</h3>
      <div class="field"><label for="st-ai">Model</label>
        <select class="select" id="st-ai" name="aiProvider">${providers.map((p) => `<option value="${p.id}" ${p.id === s.aiProvider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </div>
      <div id="ai-claude" style="display:${s.aiProvider === 'claude' ? 'block' : 'none'}">
        <p class="hint">${inClaude() ? 'Claude werkt via je eigen Claude-account, zonder API-sleutel.' : 'Claude werkt alleen als je NEXUS als Claude-artifact opent. Hier valt NEXUS terug op een melding.'} Standaard deelt NEXUS niets behalve je bericht.</p>
        <button type="button" class="btn ghost sm" data-consent>Wat mag de AI zien?</button>
      </div>
      <div id="ai-extra" style="display:${s.aiProvider === 'openai-compatible' ? 'block' : 'none'}">
        <p class="hint">Optioneel. Werkt met elke OpenAI-compatibele server, bijv. Ollama of LM Studio op je eigen computer (gratis). Gebruik een https-adres (bijv. via een tunnel); onversleuteld http wordt geblokkeerd. Je sleutel blijft op dit toestel en gaat niet mee in een onversleutelde back-up.</p>
        <div class="field"><label for="st-ep">Endpoint</label><input class="input" id="st-ep" name="aiEndpoint" value="${esc(s.aiEndpoint)}" placeholder="https://mijn-server.example/v1" inputmode="url" autocapitalize="off"></div>
        <div class="field"><label for="st-model">Modelnaam</label><input class="input" id="st-model" name="aiModel" value="${esc(s.aiModel)}" placeholder="llama3.2" autocapitalize="off"></div>
        <div class="field"><label for="st-key">API-sleutel (optioneel)</label><input class="input" type="password" id="st-key" name="aiKey" value="${esc(s.aiKey)}" autocapitalize="off"></div>
        <button type="button" class="btn ghost sm" id="st-ai-consent" data-consent>Wat mag de AI zien?</button>
        <p class="hint">Standaard deelt NEXUS niets behalve je bericht. Je kiest per onderdeel wat mee mag.</p>
      </div>
      <button class="btn block">Opslaan</button>
    </form>

    <h3>Gegevens</h3>
    <p class="hint">${s.cloudSync && inClaude() ? esc(SYNC_LABEL[syncStatus()]) + '.' : 'Alles staat alleen op dit toestel' + (inClaude() ? ' (in deze browser)' : '') + '.'} Maak af en toe een back-up — standaard versleuteld met een wachtwoord.</p>
    ${inClaude() ? `<label class="check-line"><input type="checkbox" id="st-cloud" ${s.cloudSync ? 'checked' : ''}> Synchroniseren via mijn Claude-account</label>
      <p class="hint" style="margin-top:-6px">Standaard uit. Aan: een privékopie (zonder API-sleutel) staat in je Claude-account, zodat je gegevens ook op andere apparaten beschikbaar zijn. Gebruik dit pas met echte gegevens als je daarvoor kiest.</p>
      ${s.cloudSync ? '' : '<button type="button" class="btn ghost sm" id="st-cloud-del">Kopie in Claude-account wissen</button>'}` : ''}
    <div class="grid-2">
      <button class="btn ghost" id="st-export">Back-up maken</button>
      <label class="btn ghost" style="text-align:center">Herstellen<input type="file" accept="application/json,.json" id="st-import" hidden></label>
    </div>
    <div class="stack-gap"></div>
    <div class="grid-2">
      <button class="btn ghost" id="st-demo">Demo-data laden</button>
      <button class="btn danger" id="st-reset">Alles wissen</button>
    </div>

    <h3>Herstelpunten</h3>
    <p class="hint">Vóór herstellen, demo-data en alles wissen bewaart NEXUS automatisch een kopie op dit toestel (maximaal ${MAX_RESTORE_POINTS}). Ze gaan niet mee in een back-up.</p>
    <div id="st-points">${restoreListHtml()}</div>
    <p class="hint" style="margin-top:18px;text-align:center">NEXUS v${VERSION} · ${inClaude() ? 'Claude-artifact' : 'lokaal'} · €0</p>
  `, (sheet) => {
    sheet.querySelector('#st-ai').addEventListener('change', (e) => {
      sheet.querySelector('#ai-extra').style.display = e.target.value === 'openai-compatible' ? 'block' : 'none';
      sheet.querySelector('#ai-claude').style.display = e.target.value === 'claude' ? 'block' : 'none';
    });
    sheet.querySelector('#st-cloud')?.addEventListener('change', async (e) => {
      const on = e.target.checked;
      if (on && !(await ask('Synchroniseren via je Claude-account aanzetten?\n\nEr komt dan een privékopie van al je NEXUS-gegevens (zonder API-sleutel) in je Claude-account te staan.', { ok: 'Aanzetten' }))) { e.target.checked = false; return; }
      update((st) => { st.settings.cloudSync = on; });
      if (on) initCloud({ onRemote: () => body.resetDraft() }); else stopCloud();
      toast(on ? 'Synchroniseren aan' : 'Synchroniseren uit — de kopie in je account blijft staan tot je hem wist');
    });
    sheet.querySelector('#st-cloud-del')?.addEventListener('click', async () => {
      if (!(await ask('De kopie van je NEXUS-gegevens in je Claude-account wissen? Gegevens op dit toestel blijven staan.', { ok: 'Wissen', danger: true }))) return;
      try { toast((await deleteCloudCopy()) ? 'Kopie gewist' : 'Geen kopie gevonden'); } catch (err) { toast('Wissen mislukt'); }
    });
    sheet.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      update((st) => {
        Object.assign(st.settings, {
          name: f.name.value.trim(),
          sleepTarget: Math.max(4, Math.min(12, Number(f.sleepTarget.value) || 8)),
          weeklyTrainingTarget: Math.max(0, Number(f.weeklyTrainingTarget.value) || 150),
          kcalTarget: Math.max(800, Math.min(6000, Number(f.kcalTarget.value) || 2200)),
          proteinTarget: Math.max(0, Math.min(400, Number(f.proteinTarget.value) || 140)),
          waterTarget: Math.max(1, Math.min(20, Math.round(Number(f.waterTarget.value)) || 8)),
          aiProvider: f.aiProvider.value,
          aiEndpoint: f.aiEndpoint.value.trim(),
          aiModel: f.aiModel.value.trim(),
          aiKey: f.aiKey.value.trim(),
          trackKcal: f.trackKcal.checked,
          startView: f.startView.value === 'home' ? 'home' : 'kompas',
        });
      });
      closeSheet();
      toast('Instellingen opgeslagen');
    });
    sheet.querySelectorAll('[data-consent]').forEach((b) => b.addEventListener('click', () => {
      // Eerst de gekozen AI en het endpoint bewaren, zodat de toestemming bij de juiste bestemming hoort.
      const ep = sheet.querySelector('#st-ep').value.trim();
      const prov = sheet.querySelector('#st-ai').value;
      const cur = getState().settings;
      if (ep !== cur.aiEndpoint || prov !== cur.aiProvider) update((st) => { st.settings.aiEndpoint = ep; st.settings.aiProvider = prov; }, { silent: true });
      ai.openConsentSheet();
    }));
    sheet.querySelector('#st-export').addEventListener('click', openBackupSheet);
    sheet.querySelector('#st-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('Bestand is te groot voor een NEXUS-back-up');
        const parsed = readBackup(await file.text());
        if (isEncryptedBackup(parsed)) openUnlockSheet(parsed);
        else restoreBackup(parsed);
      } catch (err) { toast(`Herstellen mislukt: ${err.message}`); }
    });
    sheet.querySelector('#st-demo').addEventListener('click', async () => {
      if (!(await ask('Demo-data laden? Dit vervangt je huidige gegevens (je naam en instellingen blijven). Er wordt eerst een herstelpunt gemaakt.', { ok: 'Laden' }))) return;
      withRestorePoint('Vóór demo-data', () => { loadDemo(); body.resetDraft(); closeSheet(); }, 'Demo-data geladen');
    });
    sheet.querySelector('#st-reset').addEventListener('click', async () => {
      if (!(await ask('Alle NEXUS-gegevens op dit toestel wissen?\n\nEr blijft een herstelpunt op dit toestel staan, zodat je dit ongedaan kunt maken. Wil je echt alles kwijt, verwijder dan daarna ook de herstelpunten (Instellingen → Herstelpunten).', { ok: 'Alles wissen', danger: true }))) return;
      withRestorePoint('Vóór alles wissen', () => { resetAll(); body.resetDraft(); closeSheet(); }, 'Alles gewist');
    });
    sheet.querySelector('#st-points').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-restore], [data-clear-points]');
      if (!b) return;
      if (b.dataset.clearPoints !== undefined) {
        if (!(await ask('Alle herstelpunten op dit toestel definitief verwijderen?', { ok: 'Verwijderen', danger: true }))) return;
        clearRestorePoints();
        sheet.querySelector('#st-points').innerHTML = restoreListHtml();
        toast('Herstelpunten verwijderd');
        return;
      }
      if (!(await ask('Dit herstelpunt terugzetten? Je huidige gegevens worden eerst zelf een herstelpunt.', { ok: 'Terugzetten' }))) return;
      try { restoreFrom(b.dataset.restore); body.resetDraft(); closeSheet(); toast('Herstelpunt teruggezet'); } catch (err) { toast(err.message); }
    });
  });
}

// ------------------------------------------------------------------
// Back-up: standaard versleuteld; de API-sleutel gaat nooit onversleuteld mee
// ------------------------------------------------------------------
function openBackupSheet() {
  const hasKey = !!getState().settings.aiKey;
  let mode = 'enc';
  openSheet(`
    <h2>Back-up maken</h2>
    <p class="hint">Een back-up bevat al je NEXUS-gegevens, ook gezondheid en reflecties. Bewaar hem op een veilige plek.</p>
    <div class="chips" id="bk-mode" role="radiogroup" aria-label="Soort back-up">
      <button type="button" class="chip on" data-mode="enc" role="radio" aria-checked="true">🔒 Versleuteld (aanbevolen)</button>
      <button type="button" class="chip" data-mode="plain" role="radio" aria-checked="false">Onversleuteld</button>
    </div>
    <form id="bk-form" autocomplete="off" style="margin-top:14px">
      <div id="bk-enc">
        <div class="field"><label for="bk-pw">Wachtwoord (minstens ${MIN_PASSWORD} tekens)</label><input class="input" type="password" id="bk-pw" autocomplete="new-password"></div>
        <div class="field"><label for="bk-pw2">Herhaal wachtwoord</label><input class="input" type="password" id="bk-pw2" autocomplete="new-password"></div>
        ${hasKey ? '<label class="check-line"><input type="checkbox" id="bk-key"> API-sleutel meenemen in deze versleutelde back-up</label>' : ''}
        <p class="hint">Wachtwoord vergeten = back-up onbruikbaar. NEXUS kan het niet voor je herstellen.</p>
      </div>
      <p class="hint" id="bk-plain-note" hidden>⚠️ Iedereen die dit bestand in handen krijgt, kan al je gegevens lezen. Je API-sleutel gaat niet mee.</p>
      <p class="hint" id="bk-err" role="alert" style="color:var(--red)"></p>
      <button class="btn block" id="bk-go">Back-up maken</button>
    </form>
  `, (sheet) => {
    const err = sheet.querySelector('#bk-err');
    sheet.querySelector('#bk-mode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.dataset.mode;
      sheet.querySelectorAll('#bk-mode .chip').forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-checked', String(c === b)); });
      sheet.querySelector('#bk-enc').hidden = mode !== 'enc';
      sheet.querySelector('#bk-plain-note').hidden = mode !== 'plain';
      err.textContent = '';
    });
    sheet.querySelector('#bk-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const go = sheet.querySelector('#bk-go');
      try {
        if (mode === 'plain') {
          await shareFile(exportJSON({ includeKey: false }), `nexus-backup-${today()}.json`);
        } else {
          const pw = sheet.querySelector('#bk-pw').value;
          if (pw.length < MIN_PASSWORD) throw new Error(`Kies een wachtwoord van minstens ${MIN_PASSWORD} tekens`);
          if (pw !== sheet.querySelector('#bk-pw2').value) throw new Error('De wachtwoorden zijn niet gelijk');
          go.disabled = true; go.textContent = 'Versleutelen…';
          const includeKey = !!sheet.querySelector('#bk-key')?.checked;
          const packed = await encryptText(exportJSON({ includeKey }), pw);
          await shareFile(JSON.stringify(packed), `nexus-backup-${today()}-versleuteld.json`);
        }
        closeSheet();
      } catch (ex) {
        err.textContent = ex.message;
        go.disabled = false; go.textContent = 'Back-up maken';
      }
    });
  });
}

function openUnlockSheet(packed) {
  openSheet(`
    <h2>Versleutelde back-up</h2>
    <p class="hint">Vul het wachtwoord in dat je bij het maken van deze back-up koos. Je huidige gegevens worden vervangen.</p>
    <form id="bk-open" autocomplete="off">
      <div class="field"><label for="bk-open-pw">Wachtwoord</label><input class="input" type="password" id="bk-open-pw" autocomplete="current-password"></div>
      <p class="hint" id="bk-open-err" role="alert" style="color:var(--red)"></p>
      <button class="btn block" id="bk-open-go">Herstellen</button>
    </form>
  `, (sheet) => {
    sheet.querySelector('#bk-open').addEventListener('submit', async (e) => {
      e.preventDefault();
      const go = sheet.querySelector('#bk-open-go');
      const err = sheet.querySelector('#bk-open-err');
      err.textContent = '';
      go.disabled = true; go.textContent = 'Ontsleutelen…';
      try {
        restoreBackup(readBackup(await decryptText(packed, sheet.querySelector('#bk-open-pw').value)));
      } catch (ex) {
        err.textContent = ex.message;
        go.disabled = false; go.textContent = 'Herstellen';
      }
    });
    setTimeout(() => sheet.querySelector('#bk-open-pw')?.focus(), 350);
  });
}

function restoreBackup(parsed) {
  withRestorePoint('Vóór herstellen back-up', () => { importJSON(parsed); body.resetDraft(); closeSheet(); }, 'Back-up hersteld');
}

// ------------------------------------------------------------------
// Herstelpunten: eerst een kopie, dan pas vervangen of wissen
// ------------------------------------------------------------------
/**
 * Voer een actie uit die alle gegevens vervangt. Lukt het herstelpunt niet (opslag vol), dan
 * vragen we eerst expliciet of de gebruiker toch door wil. Daarna een melding met "Ongedaan maken".
 */
async function withRestorePoint(reason, action, doneMsg) {
  const id = createRestorePoint(reason);
  if (!id && !(await ask('Er kon geen herstelpunt worden gemaakt (opslag vol?). Maak eerst een back-up.\n\nToch doorgaan? Dit kan dan niet ongedaan worden.', { ok: 'Toch doorgaan', danger: true }))) return false;
  action();
  if (id) toast(doneMsg, { action: 'Ongedaan maken', onAction: () => { try { restoreFrom(id); body.resetDraft(); toast('Teruggezet'); } catch (err) { toast(err.message); } } });
  else toast(doneMsg);
  return true;
}

function restoreListHtml() {
  const list = restorePoints();
  if (!list.length) return '<div class="empty">Nog geen herstelpunten.</div>';
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  return list.map((p) => `<div class="restore-row"><span><b>${esc(p.reason || 'Herstelpunt')}</b><small>${esc(when(p.t))}</small></span>
    <button class="btn ghost sm" data-restore="${esc(p.id)}">Terugzetten</button></div>`).join('')
    + '<button class="btn ghost sm" data-clear-points style="margin-top:10px">Herstelpunten verwijderen</button>';
}

async function shareFile(text, name) {
  // In een Claude-artifact werken <a download> en het deelmenu niet: gebruik de downloads-functie van Claude.
  if (inClaude()) {
    const dl = await window.claude.use('downloads').catch(() => null);
    if (dl) {
      try { await dl.save({ filename: name, data: text }); toast('Back-up opgeslagen'); return; } catch (_) { /* geweigerd: hieronder verder */ }
    }
  }
  const file = new File([text], name, { type: 'application/json' });
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
window.addEventListener('hashchange', () => { closeSheet(true); navigate(); });
initRipples();
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

// Startscherm (instelbaar): standaard het Kompas, of "Vandaag" (het vroegere Home).
if (!location.hash) history.replaceState(null, '', `#${getState().settings.startView === 'home' ? 'home' : 'kompas'}`);
navigate();
tickClock();
setInterval(tickClock, 15000);

if (!isStorageOk()) toast('⚠️ Opslag niet beschikbaar — gegevens worden niet bewaard (privémodus?)');
requestPersistence();
initCloud({ onRemote: () => body.resetDraft() });

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !inClaude()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW-registratie mislukt', e));
  });
}

// Debugtoegang tot alle gegevens alleen lokaal (ontwikkeling/tests) of met ?debug in de adresbalk.
// Zo kan een eventueel ingesloten script de staat niet via een globale variabele uitlezen.
const DEBUG = ['localhost', '127.0.0.1'].includes(location.hostname) || new URLSearchParams(location.search).has('debug');
window.NEXUS = DEBUG ? { getState, version: VERSION } : { version: VERSION };
