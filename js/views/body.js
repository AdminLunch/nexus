import { getState, update, today, lastDays, workoutMinutes, recoveryScore, uid, applyHealth } from '../store.js';
import { esc, ring, barChart, sparkline, dayLabel, shortDate, openSheet, closeSheet, icons, haptic, toast } from '../ui.js';
import { parseHealthText } from '../health.js';

export const WORKOUT_TYPES = [
  { t: 'Kracht', e: '🏋️' }, { t: 'Hardlopen', e: '🏃' }, { t: 'Fietsen', e: '🚴' },
  { t: 'Wandelen', e: '🚶' }, { t: 'Yoga', e: '🧘' }, { t: 'Zwemmen', e: '🏊' },
  { t: 'HIIT', e: '⚡' }, { t: 'Sport', e: '⚽' }, { t: 'Overig', e: '✦' },
];
const typeIcon = (t) => (WORKOUT_TYPES.find((x) => x.t === t) || WORKOUT_TYPES.at(-1)).e;

let draftSleep = null; // { hours, quality } — wordt gevuld tot je opslaat
let sleepRange = 7;

function readinessText(score) {
  if (score == null) return { h: 'Nog geen score', p: 'Log je slaap van afgelopen nacht om je herstelscore te zien.', b: '' };
  if (score >= 80) return { h: 'Volledig hersteld', p: 'Goede dag voor een zware of intensieve training.', b: '<span class="badge g">Groen licht</span>' };
  if (score >= 60) return { h: 'Goed hersteld', p: 'Normale training is prima. Luister naar je lichaam.', b: '<span class="badge">Normaal</span>' };
  if (score >= 40) return { h: 'Matig hersteld', p: 'Kies voor rustige beweging: wandelen, mobiliteit of yoga.', b: '<span class="badge a">Rustig aan</span>' };
  return { h: 'Herstel nodig', p: 'Prioriteit: slaap, voeding en rust. Sla intensieve training over.', b: '<span class="badge r">Herstel</span>' };
}

export function render(el) {
  const s = getState();
  const t = today();
  const target = s.settings.sleepTarget || 8;
  const logged = s.sleep[t];
  if (!draftSleep) draftSleep = logged ? { ...logged } : { hours: 7.5, quality: 3 };
  const score = recoveryScore(t);
  const rt = readinessText(score);
  const sDays = lastDays(sleepRange);
  const sleepVals = sDays.map((d) => s.sleep[d]?.hours ?? 0);
  const sleepLogged = sDays.filter((d) => s.sleep[d]);
  const avgSleep = sleepLogged.length ? (sleepLogged.reduce((a, d) => a + s.sleep[d].hours, 0) / sleepLogged.length).toFixed(1) : '—';
  const w7 = lastDays(7);
  const weekMin = workoutMinutes(w7);
  const weekTarget = s.settings.weeklyTrainingTarget || 150;
  const trainVals = w7.map((d) => workoutMinutes([d]));
  const recent = [...s.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  el.innerHTML = `
    <section class="page-head">
      <div class="eyebrow">Body</div>
      <h1 class="page-title">Lichaam <span class="grad">opgeladen</span></h1>
      <p class="page-sub">Sport, slaap en herstel.</p>
    </section>

    <section class="card readiness" aria-label="Herstel">
      ${ring(score ?? 0, { size: 104, label: score ?? '—', sub: 'herstel', key: 'body-rec', pulse: score != null })}
      <div>
        ${rt.b}
        <h3 style="margin-top:8px">${rt.h}</h3>
        <p>${rt.p}</p>
      </div>
    </section>

    ${healthCard(s, t)}

    <section class="card" aria-label="Slaap loggen">
      <div class="card-head"><h2 class="card-title">Afgelopen nacht</h2><span class="card-note">${logged ? 'Gelogd ✓' : 'Nog niet gelogd'}</span></div>
      <div class="stepper">
        <button data-step="-0.25" aria-label="Minder slaap">−</button>
        <div class="val"><span id="sleep-h">${String(draftSleep.hours).replace('.', ',')}</span><small> uur</small></div>
        <button data-step="0.25" aria-label="Meer slaap">+</button>
      </div>
      <div class="field" style="margin-top:14px;margin-bottom:12px">
        <label>Kwaliteit</label>
        <div class="scale numeric" id="sleep-q">
          ${[1, 2, 3, 4, 5].map((q) => `<button class="${draftSleep.quality === q ? 'on' : ''}" data-q="${q}">${q}</button>`).join('')}
        </div>
      </div>
      <button class="btn block" id="save-sleep">${logged ? 'Bijwerken' : 'Slaap opslaan'}</button>
    </section>

    <section class="card" aria-label="Slaapgrafiek">
      <div class="card-head">
        <h2 class="card-title">Slaap</h2>
        <div class="chips" id="sleep-range">
          <button class="chip ${sleepRange === 7 ? 'on' : ''}" data-r="7">7d</button>
          <button class="chip ${sleepRange === 14 ? 'on' : ''}" data-r="14">14d</button>
        </div>
      </div>
      ${sleepLogged.length ? barChart(sleepVals, { labels: sDays.map((d) => (sleepRange === 7 ? dayLabel(d) : d.slice(8))), target, unit: ' u', showValues: sleepRange === 7 }) : '<div class="empty">Nog geen slaap gelogd.</div>'}
      <div class="legend"><span>Gemiddeld <b class="mono">${avgSleep}</b> uur</span><span style="color:var(--amber)">- - doel ${target} uur</span></div>
    </section>

    <section class="card" aria-label="Training">
      <div class="card-head"><h2 class="card-title">Training 7 dagen</h2><button class="btn sm" id="add-workout">+ Training</button></div>
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <span><b class="mono" style="font-size:24px">${weekMin}</b> <span class="card-note">/ ${weekTarget} min</span></span>
        <span class="badge v">${Math.min(999, Math.round((weekMin / weekTarget) * 100))}%</span>
      </div>
      <div class="bar"><i data-w="${Math.min(100, Math.round((weekMin / weekTarget) * 100))}" data-key="body-week"></i></div>
      <div class="stack-gap"></div>
      ${barChart(trainVals, { labels: w7.map(dayLabel), unit: ' min' })}
    </section>

    <section class="card" aria-label="Recente trainingen">
      <div class="card-head"><h2 class="card-title">Recent</h2><span class="card-note">${s.workouts.length} totaal</span></div>
      <div id="workout-list">
        ${recent.map((w) => `
          <div class="list-row" data-id="${w.id}">
            <span class="ico">${typeIcon(w.type)}</span>
            <span class="main"><b>${esc(w.type)}</b><small>${w.date === t ? 'Vandaag' : esc(shortDate(w.date))} · intensiteit ${w.intensity}/5</small></span>
            <span class="mono">${w.minutes}′</span>
            <button class="del-btn" data-del aria-label="Verwijder training">${icons.x}</button>
          </div>`).join('') || '<div class="empty">Nog geen trainingen. Tik op + Training.</div>'}
      </div>
    </section>
  `;

  // ---- events ----
  el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    draftSleep.hours = Math.max(0, Math.min(14, Math.round((draftSleep.hours + Number(b.dataset.step)) * 4) / 4));
    el.querySelector('#sleep-h').textContent = String(draftSleep.hours).replace('.', ',');
    haptic(5);
  }));
  el.querySelector('#sleep-q').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    draftSleep.quality = Number(b.dataset.q);
    el.querySelectorAll('#sleep-q button').forEach((x) => x.classList.toggle('on', x === b));
  });
  el.querySelector('#save-sleep').addEventListener('click', () => {
    update((st) => { st.sleep[t] = { hours: draftSleep.hours, quality: draftSleep.quality }; });
    haptic(15);
    toast('Slaap opgeslagen');
  });
  el.querySelector('#sleep-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    sleepRange = Number(b.dataset.r);
    render(el);
  });
  el.querySelector('#health-import').addEventListener('click', importFromClipboard);
  el.querySelector('#health-paste').addEventListener('click', () => openPasteSheet());
  el.querySelector('#add-workout').addEventListener('click', openWorkoutSheet);
  el.querySelector('#workout-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (!confirm('Deze training verwijderen?')) return;
    update((st) => { st.workouts = st.workouts.filter((w) => w.id !== id); });
  });
}

/** Na een datumwissel of import opnieuw beginnen met het concept. */
export function resetDraft() { draftSleep = null; }

// ---------- Apple Gezondheid ----------
function latest(s, field, t) {
  const d = lastDays(7, t).reverse().find((k) => s.health[k]?.[field] != null);
  return d ? { v: s.health[d][field], d } : null;
}

function healthCard(s, t) {
  const days = lastDays(10, t);
  const tile = (label, field, unit) => {
    const x = latest(s, field, t);
    const when = !x ? 'geen data' : x.d === t ? 'vandaag' : esc(shortDate(x.d));
    const val = x ? (field === 'steps' ? x.v.toLocaleString('nl-NL') : x.v) : '—';
    return `<div class="card tile">
      <div class="k">${label}</div>
      <div class="v">${val}${x && unit ? `<small>${unit}</small>` : ''}</div>
      <div class="s">${when}</div>
      <div class="spark">${sparkline(days.map((d) => s.health[d]?.[field] ?? null))}</div>
    </div>`;
  };
  const at = s.healthImportedAt ? new Date(s.healthImportedAt) : null;
  const atText = at ? `Bijgewerkt ${dateLabelTime(at)}` : 'Nog niet geïmporteerd';
  return `
    <section class="card" aria-label="Apple Gezondheid">
      <div class="card-head"><h2 class="card-title">Gezondheid</h2><span class="card-note">${atText}</span></div>
      <div class="grid-3">
        ${tile('Stappen', 'steps', '')}
        ${tile('Rust-HS', 'rhr', 'bpm')}
        ${tile('HRV', 'hrv', 'ms')}
      </div>
      <button class="btn block" id="health-import" style="margin-top:12px">↻ Importeer uit Gezondheid</button>
      <div class="row" style="justify-content:space-between;margin-top:8px">
        <button class="btn ghost sm" id="health-paste">Handmatig plakken</button>
        <a class="btn ghost sm" href="uitleg-gezondheid.html">Hoe stel ik dit in?</a>
      </div>
    </section>`;
}

function dateLabelTime(d) {
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return k === today() ? `vandaag ${hm}` : `${shortDate(k)} ${hm}`;
}

function runImport(text) {
  const parsed = parseHealthText(text);
  if (!parsed.count) throw new Error('De opdracht gaf geen metingen door');
  resetDraft();
  const r = applyHealth(parsed);
  haptic(15);
  const parts = [];
  if (r.nSleep) parts.push(r.nSleep === 1 ? '1 nacht' : `${r.nSleep} nachten`);
  if (r.nDays) parts.push(r.nDays === 1 ? '1 dag' : `${r.nDays} dagen`);
  if (r.nWork) parts.push(r.nWork === 1 ? '1 nieuwe training' : `${r.nWork} nieuwe trainingen`);
  toast(`Geïmporteerd: ${parts.join(' · ') || 'niets nieuws'}`);
}

async function importFromClipboard() {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch (_) {
    openPasteSheet('Het klembord kon niet automatisch gelezen worden. Plak de tekst hieronder.');
    return;
  }
  try { runImport(text); } catch (err) {
    openPasteSheet(`${err.message}. Draai eerst de opdracht “NEXUS Gezondheid”, of plak de tekst hieronder.`);
  }
}

function openPasteSheet(msg = '') {
  openSheet(`
    <h2>Gezondheid plakken</h2>
    ${msg ? `<p class="card-note" style="margin-bottom:12px">${esc(msg)}</p>` : ''}
    <div class="field"><textarea class="textarea" id="hp-text" placeholder="NEXUS-HEALTH …" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></div>
    <button class="btn block" id="hp-go">Importeren</button>
  `, (sheet) => {
    sheet.querySelector('#hp-go').addEventListener('click', () => {
      try { runImport(sheet.querySelector('#hp-text').value); closeSheet(); } catch (err) { toast(err.message); }
    });
  });
}

function openWorkoutSheet() {
  const w = { type: 'Kracht', minutes: 45, intensity: 3, date: today() };
  openSheet(`
    <h2>Training toevoegen</h2>
    <div class="field"><label>Type</label>
      <div class="chips" id="w-type">${WORKOUT_TYPES.map((x) => `<button class="chip ${x.t === w.type ? 'on' : ''}" data-t="${x.t}">${x.e} ${x.t}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Duur</label>
      <div class="stepper">
        <button data-m="-5" aria-label="5 minuten minder">−</button>
        <div class="val"><span id="w-min">${w.minutes}</span><small> min</small></div>
        <button data-m="5" aria-label="5 minuten meer">+</button>
      </div>
    </div>
    <div class="field"><label>Intensiteit</label>
      <div class="scale numeric" id="w-int">${[1, 2, 3, 4, 5].map((i) => `<button class="${i === w.intensity ? 'on' : ''}" data-i="${i}">${i}</button>`).join('')}</div>
    </div>
    <div class="field"><label>Datum</label><input type="date" class="input" id="w-date" value="${w.date}" max="${today()}"></div>
    <button class="btn block" id="w-save">Opslaan</button>
  `, (sheet) => {
    sheet.querySelector('#w-type').addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      w.type = b.dataset.t;
      sheet.querySelectorAll('#w-type .chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    sheet.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      w.minutes = Math.max(5, Math.min(600, w.minutes + Number(b.dataset.m)));
      sheet.querySelector('#w-min').textContent = w.minutes;
      haptic(5);
    }));
    sheet.querySelector('#w-int').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      w.intensity = Number(b.dataset.i);
      sheet.querySelectorAll('#w-int button').forEach((c) => c.classList.toggle('on', c === b));
    });
    sheet.querySelector('#w-save').addEventListener('click', () => {
      w.date = sheet.querySelector('#w-date').value || today();
      update((st) => { st.workouts.push({ id: uid(), ...w }); });
      closeSheet();
      haptic(15);
      toast(`${w.type} · ${w.minutes} min opgeslagen`);
    });
  });
}
