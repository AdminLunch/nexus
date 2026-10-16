import { getState, update, today, lastDays, habitsDoneOn, habitStreak, toggleHabit, uid } from '../store.js';
import { esc, MOODS, lineChart, dayLabel, shortDate, openSheet, closeSheet, icons, haptic, toast } from '../ui.js';

const PROMPTS = [
  'Waar ben je vandaag dankbaar voor?',
  'Wat gaf je vandaag energie — en wat kostte energie?',
  'Wat zou je morgen anders doen?',
  'Welk klein succes verdient erkenning?',
  'Waar maak je je zorgen over, en wat kun je eraan doen?',
  'Wat heb je vandaag geleerd?',
  'Met wie had je een goed moment?',
  'Wat is het belangrijkste dat je morgen wilt bereiken?',
];
const HABIT_ICONS = ['💧', '📖', '⚡', '🧘', '🌙', '🥗', '🚶', '✍️', '🎯', '💊', '📵', '🏋️', '🎧', '☀️', '🧠', '💤'];

let trendMode = 'mood';
let justHabit = null;
let saveTimer = null;

export function render(el) {
  const s = getState();
  const t = today();
  const mood = s.moods[t];
  const days14 = lastDays(14);
  const days28 = lastDays(28);
  const dayIdx = Math.floor(Date.now() / 86400000);
  const prompt = PROMPTS[dayIdx % PROMPTS.length];
  const done = habitsDoneOn(t);
  const week = lastDays(7);

  const trendVals = days14.map((d) => (trendMode === 'mood' ? s.moods[d]?.mood : s.moods[d]?.energy) ?? null);
  const logged = trendVals.filter((v) => v != null);
  const avg = logged.length ? (logged.reduce((a, b) => a + b, 0) / logged.length).toFixed(1) : '—';

  const habitCount = s.habits.length || 1;
  const heat = days28.map((d) => {
    const n = habitsDoneOn(d).filter((id) => s.habits.some((h) => h.id === id)).length;
    const r = n / habitCount;
    return { d, l: n === 0 ? 0 : r < 0.34 ? 1 : r < 0.67 ? 2 : r < 1 ? 3 : 4 };
  });

  el.innerHTML = `
    <section class="page-head">
      <div class="eyebrow">Mind</div>
      <h1 class="page-title">Hoofd <span class="grad">helder</span></h1>
      <p class="page-sub">Stemming, reflectie en gewoontes.</p>
    </section>

    <section class="card" aria-label="Stemming">
      <div class="card-head"><h2 class="card-title">Hoe voel je je?</h2><span class="card-note">${mood ? 'Gelogd ✓' : 'Vandaag'}</span></div>
      <div class="scale" id="mood-scale">
        ${MOODS.map((m, i) => `<button class="${mood?.mood === i + 1 ? 'on' : ''}" data-mood="${i + 1}" aria-pressed="${mood?.mood === i + 1}"><span class="e">${m.e}</span><small>${m.l}</small></button>`).join('')}
      </div>
      <div style="margin-top:16px">
        <div class="row" style="justify-content:space-between"><span class="card-note">ENERGIE</span><b class="mono" id="energy-val">${mood?.energy ?? 5}/10</b></div>
        <input type="range" class="range" id="energy" min="0" max="10" step="1" value="${mood?.energy ?? 5}" aria-label="Energie">
      </div>
    </section>

    <section class="card" aria-label="Trend">
      <div class="card-head">
        <h2 class="card-title">Trend 14 dagen</h2>
        <div class="chips" id="trend-toggle">
          <button class="chip ${trendMode === 'mood' ? 'on' : ''}" data-mode="mood">Stemming</button>
          <button class="chip ${trendMode === 'energy' ? 'on' : ''}" data-mode="energy">Energie</button>
        </div>
      </div>
      ${lineChart(trendVals, { labels: days14.map(dayLabel), min: trendMode === 'mood' ? 1 : 0, max: trendMode === 'mood' ? 5 : 10 })}
      <div class="legend"><span>Gemiddeld <b class="mono">${avg}</b></span><span>${logged.length}/14 dagen gelogd</span></div>
    </section>

    <section class="card" aria-label="Reflectie">
      <div class="card-head"><h2 class="card-title">Reflectie</h2><span class="save-state" id="save-state">${s.reflections[t] ? 'Opgeslagen' : ''}</span></div>
      <div class="prompt-box"><span>Vraag van vandaag</span>${esc(prompt)}</div>
      <textarea class="textarea" id="reflection" placeholder="Schrijf vrij — het blijft op je toestel.">${esc(s.reflections[t] || '')}</textarea>
      <button class="btn ghost sm" id="history" style="margin-top:10px">Eerdere reflecties</button>
    </section>

    <section class="card" aria-label="Gewoontes">
      <div class="card-head"><h2 class="card-title">Gewoontes</h2><button class="btn ghost sm" id="manage">Beheren</button></div>
      <div class="check-list" id="habit-list">
        ${s.habits.map((h) => {
          const on = done.includes(h.id);
          const streak = habitStreak(h.id);
          return `<button class="habit ${on ? 'done' : ''} ${justHabit === h.id ? 'just' : ''}" data-habit="${h.id}" aria-pressed="${on}">
            <span class="ico">${esc(h.icon)}</span>
            <span class="nm"><b>${esc(h.name)}</b><small>${streak ? `🔥 ${streak} ${streak === 1 ? 'dag' : 'dagen'} op rij` : 'Start vandaag je reeks'}</small></span>
            <span class="week" aria-hidden="true">${week.map((d) => `<i class="${habitsDoneOn(d).includes(h.id) ? 'on' : ''}"></i>`).join('')}</span>
          </button>`;
        }).join('') || '<div class="empty">Nog geen gewoontes. Tik op Beheren.</div>'}
      </div>
    </section>

    <section class="card" aria-label="Consistentie">
      <div class="card-head"><h2 class="card-title">Consistentie 28 dagen</h2><span class="card-note">${shortDate(days28[0])} – vandaag</span></div>
      <div class="heatmap">${heat.map((c) => `<i data-l="${c.l}" class="${c.d === t ? 'today' : ''}" title="${c.d}"></i>`).join('')}</div>
      <div class="legend"><span>minder</span><span>meer</span></div>
    </section>
  `;
  justHabit = null;

  // ---- events ----
  el.querySelector('#mood-scale').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    update((st) => { st.moods[t] = { mood: Number(b.dataset.mood), energy: st.moods[t]?.energy ?? 5 }; });
    haptic(12);
  });
  const range = el.querySelector('#energy');
  range.addEventListener('input', () => { el.querySelector('#energy-val').textContent = `${range.value}/10`; });
  range.addEventListener('change', () => {
    update((st) => { st.moods[t] = { mood: st.moods[t]?.mood ?? 3, energy: Number(range.value) }; });
  });

  el.querySelector('#trend-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === trendMode) return;
    trendMode = b.dataset.mode;
    render(el);
  });

  const ta = el.querySelector('#reflection');
  const stateEl = el.querySelector('#save-state');
  ta.addEventListener('input', () => {
    stateEl.textContent = 'Bezig…';
    stateEl.classList.remove('ok');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // stil opslaan: niet opnieuw renderen terwijl je typt
      update((st) => { if (ta.value.trim()) st.reflections[t] = ta.value; else delete st.reflections[t]; }, { silent: true });
      stateEl.textContent = 'Opgeslagen ✓';
      stateEl.classList.add('ok');
    }, 600);
  });

  el.querySelector('#history').addEventListener('click', () => openHistory());
  el.querySelector('#manage').addEventListener('click', () => openManage(el));

  el.querySelector('#habit-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-habit]');
    if (!b) return;
    justHabit = b.dataset.habit;
    toggleHabit(b.dataset.habit);
    haptic(12);
  });
}

function openHistory() {
  const s = getState();
  const entries = Object.entries(s.reflections).filter(([, v]) => v && v.trim()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 60);
  openSheet(`
    <h2>Eerdere reflecties</h2>
    ${entries.length ? entries.map(([d, v]) => `
      <div class="card" style="padding:14px">
        <div class="eyebrow" style="margin-bottom:6px">${esc(shortDate(d))} ${s.moods[d] ? MOODS[s.moods[d].mood - 1].e : ''}</div>
        <div style="white-space:pre-wrap;font-size:15px">${esc(v)}</div>
      </div>`).join('') : '<div class="empty">Nog geen reflecties opgeslagen.</div>'}
    <button class="btn ghost block" data-close>Sluiten</button>
  `, (sheet) => sheet.querySelector('[data-close]').addEventListener('click', () => closeSheet()));
}

function openManage(viewEl) {
  let icon = HABIT_ICONS[0];
  const draw = (sheet) => {
    const s = getState();
    sheet.querySelector('#habit-manage').innerHTML = s.habits.map((h) => `
      <li class="check-item" data-id="${h.id}"><span style="font-size:20px">${esc(h.icon)}</span><span class="check-text">${esc(h.name)}</span>
      <button class="del-btn" data-del aria-label="Verwijder ${esc(h.name)}">${icons.x}</button></li>`).join('') || '<div class="empty">Geen gewoontes.</div>';
  };
  openSheet(`
    <h2>Gewoontes beheren</h2>
    <ul class="check-list" id="habit-manage"></ul>
    <h3>Nieuwe gewoonte</h3>
    <div class="chips" id="icon-pick" style="margin-bottom:12px">
      ${HABIT_ICONS.map((i, n) => `<button class="chip ${n === 0 ? 'on' : ''}" data-icon="${i}">${i}</button>`).join('')}
    </div>
    <form class="add-row" id="habit-form" autocomplete="off" style="margin-top:0">
      <input class="input" name="name" placeholder="Bijv. 10 min stretchen" maxlength="40" aria-label="Naam gewoonte">
      <button class="btn btn-square" aria-label="Toevoegen">${icons.plus}</button>
    </form>
    <div class="stack-gap"></div>
    <button class="btn ghost block" data-close>Klaar</button>
  `, (sheet) => {
    draw(sheet);
    sheet.querySelector('#icon-pick').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      icon = b.dataset.icon;
      sheet.querySelectorAll('#icon-pick .chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    sheet.querySelector('#habit-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      update((st) => { st.habits.push({ id: uid(), name, icon }); });
      e.target.name.value = '';
      draw(sheet);
      toast('Gewoonte toegevoegd');
    });
    sheet.querySelector('#habit-manage').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const id = b.closest('[data-id]').dataset.id;
      const h = getState().habits.find((x) => x.id === id);
      if (!confirm(`"${h.name}" verwijderen? De geschiedenis van deze gewoonte telt dan niet meer mee.`)) return;
      update((st) => { st.habits = st.habits.filter((x) => x.id !== id); });
      draw(sheet);
    });
    sheet.querySelector('[data-close]').addEventListener('click', () => closeSheet());
  });
}
