import { getState, update, today, addDays, lastDays, prioritiesFor, habitsDoneOn, dayScore, workoutMinutes, goalProgress, uid, toggleHabit } from '../store.js';
import { esc, ring, sparkline, icons, prettyDate, haptic, toast, MOODS } from '../ui.js';

let justToggled = null;

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Goedenacht';
  if (h < 12) return 'Goedemorgen';
  if (h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function scoreMessage(score, hasPriorities) {
  if (score >= 100) return 'Alles afgerond. Sterke dag.';
  if (score >= 70) return 'Bijna rond — houd het vast.';
  if (score >= 35) return 'Goed op weg. Volgende stap?';
  return hasPriorities ? 'Start met je eerste prioriteit.' : 'Kies je drie belangrijkste taken.';
}

export function render(el) {
  const s = getState();
  const t = today();
  const pr = prioritiesFor(t);
  const yesterdayOpen = prioritiesFor(addDays(t, -1)).filter((p) => !p.done && !pr.some((x) => x.text === p.text));
  const score = dayScore(t);
  const name = s.settings.name ? `, ${esc(s.settings.name)}` : '';
  const mood = s.moods[t];
  const sleep = s.sleep[t];
  const week = lastDays(7);
  const weekMin = workoutMinutes(week);
  const activeGoals = s.goals.filter((g) => goalProgress(g) < 100);
  const avgGoal = activeGoals.length ? Math.round(activeGoals.reduce((a, g) => a + goalProgress(g), 0) / activeGoals.length) : 0;
  const doneHabits = habitsDoneOn(t);

  el.innerHTML = `
    <section class="page-head">
      <div class="eyebrow">${esc(prettyDate(t))}</div>
      <h1 class="page-title">${greeting()}<span class="grad">${name}</span></h1>
    </section>

    <section class="card hero" aria-label="Dagscore">
      <div>
        <div class="eyebrow">Dagscore</div>
        <h2>${scoreMessage(score, pr.length > 0)}</h2>
        <p>${pr.filter((p) => p.done).length}/${pr.length} prioriteiten · ${doneHabits.length}/${s.habits.length} gewoontes</p>
      </div>
      ${ring(score, { label: score, sub: 'score', key: 'home-score', pulse: true })}
    </section>

    <section class="card" aria-label="Prioriteiten">
      <div class="card-head">
        <h2 class="card-title">Prioriteiten vandaag</h2>
        <span class="card-note mono">${pr.filter((p) => p.done).length}/${pr.length}</span>
      </div>
      ${pr.length ? `<ul class="check-list" id="prio-list">
        ${pr.map((p) => `
          <li class="check-item ${p.done ? 'done' : ''} ${justToggled === p.id ? 'just' : ''}" data-id="${p.id}">
            <button class="check-box" data-act="toggle" aria-label="${p.done ? 'Markeer als open' : 'Markeer als klaar'}">${icons.check}</button>
            <span class="check-text">${esc(p.text)}</span>
            <button class="del-btn" data-act="del" aria-label="Verwijder">${icons.x}</button>
          </li>`).join('')}
      </ul>` : `<div class="empty">Wat zijn je 3 belangrijkste dingen vandaag?</div>`}
      <form class="add-row" id="prio-form" autocomplete="off">
        <input class="input" name="text" placeholder="${pr.length >= 3 ? 'Nog iets? Houd het kort.' : 'Nieuwe prioriteit…'}" maxlength="120" aria-label="Nieuwe prioriteit">
        <button class="btn btn-square" aria-label="Toevoegen">${icons.plus}</button>
      </form>
      ${yesterdayOpen.length ? `<button class="btn ghost sm" id="carry" style="margin-top:10px">↻ ${yesterdayOpen.length} open van gisteren overnemen</button>` : ''}
    </section>

    <section class="grid-2" aria-label="Overzicht">
      <button class="card tile" data-go="mind">
        <div class="k">Stemming</div>
        <div class="v">${mood ? MOODS[mood.mood - 1].e : '—'}${mood ? `<small>${MOODS[mood.mood - 1].l}</small>` : ''}</div>
        <div class="s">${mood ? `Energie ${mood.energy}/10` : 'Nog niet gelogd'}</div>
        <div class="spark">${sparkline(lastDays(10).map((d) => s.moods[d]?.mood ?? null))}</div>
      </button>
      <button class="card tile" data-go="body">
        <div class="k">Slaap</div>
        <div class="v">${sleep ? String(sleep.hours).replace('.', ',') : '—'}<small>uur</small></div>
        <div class="s">${sleep ? `Kwaliteit ${sleep.quality}/5` : 'Log je nacht'}</div>
        <div class="spark">${sparkline(lastDays(10).map((d) => s.sleep[d]?.hours ?? null))}</div>
      </button>
      <button class="card tile" data-go="body">
        <div class="k">Training 7d</div>
        <div class="v">${weekMin}<small>min</small></div>
        <div class="s">Doel ${s.settings.weeklyTrainingTarget} min</div>
        <div class="bar" style="margin-top:12px"><i data-w="${Math.min(100, Math.round((weekMin / (s.settings.weeklyTrainingTarget || 150)) * 100))}" data-key="home-train"></i></div>
      </button>
      <button class="card tile" data-go="goals">
        <div class="k">Doelen</div>
        <div class="v">${activeGoals.length}<small>actief</small></div>
        <div class="s">Gem. ${avgGoal}% voortgang</div>
        <div class="bar" style="margin-top:12px"><i data-w="${avgGoal}" data-key="home-goals"></i></div>
      </button>
    </section>
    <div class="stack-gap"></div>

    ${!mood ? `
    <section class="card" aria-label="Snelle check-in">
      <div class="card-head"><h2 class="card-title">Snelle check-in</h2><span class="card-note">Hoe voel je je?</span></div>
      <div class="scale" id="quick-mood">
        ${MOODS.map((m, i) => `<button data-mood="${i + 1}" aria-label="${m.l}"><span class="e">${m.e}</span><small>${m.l}</small></button>`).join('')}
      </div>
    </section>` : ''}

    <section class="card" aria-label="Gewoontes vandaag">
      <div class="card-head"><h2 class="card-title">Gewoontes</h2><a class="card-note" href="#/mind">Beheer →</a></div>
      <div class="chips" id="habit-chips">
        ${s.habits.map((h) => `<button class="chip ${doneHabits.includes(h.id) ? 'on' : ''}" data-habit="${h.id}">${esc(h.icon)} ${esc(h.name)}</button>`).join('') || '<div class="empty">Voeg gewoontes toe onder Mind.</div>'}
      </div>
    </section>
  `;
  justToggled = null;

  // ---- events ----
  el.querySelector('#prio-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.text;
    const text = input.value.trim();
    if (!text) return;
    update((st) => { (st.priorities[t] ||= []).push({ id: uid(), text, done: false }); });
    haptic();
    el.querySelector('#prio-form .input')?.focus();
  });

  el.querySelector('#prio-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (btn.dataset.act === 'toggle') {
      justToggled = id;
      update((st) => { const p = st.priorities[t].find((x) => x.id === id); p.done = !p.done; });
      haptic(12);
    } else {
      update((st) => { st.priorities[t] = st.priorities[t].filter((x) => x.id !== id); });
    }
  });

  el.querySelector('#carry')?.addEventListener('click', () => {
    update((st) => { (st.priorities[t] ||= []).push(...yesterdayOpen.map((p) => ({ id: uid(), text: p.text, done: false }))); });
    toast('Overgenomen van gisteren');
  });

  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/${b.dataset.go}`; }));

  el.querySelector('#quick-mood')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mood]');
    if (!b) return;
    update((st) => { st.moods[t] = { mood: Number(b.dataset.mood), energy: st.moods[t]?.energy ?? 5 }; });
    haptic(12);
    toast('Stemming gelogd');
  });

  el.querySelector('#habit-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-habit]');
    if (!b) return;
    toggleHabit(b.dataset.habit);
    haptic(10);
  });
}
