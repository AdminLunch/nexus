import { getState, update, today, daysBetween, goalProgress, uid } from '../store.js';
import { esc, ring, shortDate, openSheet, closeSheet, icons, haptic, toast } from '../ui.js';

export const CATEGORIES = ['Persoonlijk', 'Werk', 'Gezondheid', 'Project', 'Financieel', 'Leren'];
const CAT_BADGE = { Persoonlijk: '', Werk: 'v', Gezondheid: 'g', Project: 'v', Financieel: 'a', Leren: '' };

let filter = 'Alle';
const openIds = new Set();
let showDone = false;

function deadlineInfo(g) {
  if (!g.deadline) return '';
  const left = daysBetween(today(), g.deadline);
  if (left < 0) return `<span class="badge r">${-left}d over deadline</span>`;
  if (left === 0) return '<span class="badge a">Vandaag</span>';
  if (left <= 14) return `<span class="badge a">nog ${left}d</span>`;
  return `<span>⏱ ${esc(shortDate(g.deadline))}</span>`;
}

export function render(el) {
  const s = getState();
  const all = [...s.goals].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const active = all.filter((g) => goalProgress(g) < 100);
  const done = all.filter((g) => goalProgress(g) >= 100);
  const shown = (showDone ? done : active).filter((g) => filter === 'Alle' || g.category === filter);
  const ms = s.goals.flatMap((g) => g.milestones);
  const overall = ms.length ? Math.round((ms.filter((m) => m.done).length / ms.length) * 100) : 0;

  el.innerHTML = `
    <section class="page-head">
      <div class="eyebrow">Goals</div>
      <h1 class="page-title">Bouw aan <span class="grad">morgen</span></h1>
      <p class="page-sub">Doelen en projecten, opgeknipt in mijlpalen.</p>
    </section>

    <section class="card hero" aria-label="Overzicht doelen">
      <div>
        <div class="eyebrow">Totale voortgang</div>
        <h2>${active.length} actief · ${done.length} behaald</h2>
        <p>${ms.filter((m) => m.done).length} van ${ms.length} mijlpalen afgerond</p>
        <button class="btn sm" id="new-goal" style="margin-top:12px">+ Nieuw doel</button>
      </div>
      ${ring(overall, { size: 100, label: `${overall}%`, sub: 'totaal', key: 'goals-all' })}
    </section>

    <div class="chips" id="filters" style="margin:4px 0 14px">
      ${['Alle', ...CATEGORIES].map((c) => `<button class="chip ${filter === c ? 'on' : ''}" data-f="${c}">${c}</button>`).join('')}
    </div>

    <div id="goal-list">
      ${shown.map((g) => {
        const pct = goalProgress(g);
        const open = openIds.has(g.id);
        return `<article class="card goal ${open ? 'open' : ''}" data-id="${g.id}">
          <div class="goal-top" data-act="expand">
            <div style="min-width:0">
              <span class="badge ${CAT_BADGE[g.category] ?? ''}">${esc(g.category)}</span>
              <h3>${esc(g.title)}</h3>
              <div class="meta">${deadlineInfo(g)}<span>${g.milestones.filter((m) => m.done).length}/${g.milestones.length} mijlpalen</span></div>
            </div>
            <div style="text-align:right;display:grid;justify-items:end;gap:6px">
              <span class="pct">${pct}%</span>${icons.chev}
            </div>
          </div>
          <div class="bar"><i data-w="${pct}" data-key="goal-${g.id}"></i></div>
          <div class="goal-body">
            ${g.why ? `<p class="why">“${esc(g.why)}”</p>` : ''}
            <ul class="check-list">
              ${g.milestones.map((m) => `<li class="check-item ${m.done ? 'done' : ''}" data-mid="${m.id}">
                <button class="check-box" data-act="ms-toggle" aria-label="Mijlpaal afvinken">${icons.check}</button>
                <span class="check-text">${esc(m.text)}</span>
                <button class="del-btn" data-act="ms-del" aria-label="Verwijder mijlpaal">${icons.x}</button>
              </li>`).join('') || '<div class="empty">Voeg je eerste mijlpaal toe.</div>'}
            </ul>
            <form class="add-row" data-act="ms-add" autocomplete="off">
              <input class="input" name="text" placeholder="Nieuwe mijlpaal…" maxlength="100" aria-label="Nieuwe mijlpaal">
              <button class="btn btn-square" aria-label="Toevoegen">${icons.plus}</button>
            </form>
            <div class="row" style="margin-top:12px;justify-content:space-between">
              <button class="btn ghost sm" data-act="edit">Bewerken</button>
              <button class="btn danger sm" data-act="del">Verwijderen</button>
            </div>
          </div>
        </article>`;
      }).join('') || `<div class="card empty">${showDone ? 'Nog geen behaalde doelen in deze categorie.' : 'Geen actieve doelen hier. Tik op “+ Nieuw doel”.'}</div>`}
    </div>
    <button class="btn ghost block" id="toggle-done">${showDone ? '← Actieve doelen' : `Behaalde doelen (${done.length})`}</button>
  `;

  // ---- events ----
  el.querySelector('#new-goal').addEventListener('click', () => openGoalSheet());
  el.querySelector('#toggle-done').addEventListener('click', () => { showDone = !showDone; render(el); });
  el.querySelector('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f; render(el);
  });

  const list = el.querySelector('#goal-list');
  list.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    const card = e.target.closest('[data-id]');
    if (!act || !card) return;
    const id = card.dataset.id;
    const a = act.dataset.act;
    if (a === 'expand') {
      if (openIds.has(id)) openIds.delete(id); else openIds.add(id);
      card.classList.toggle('open');
    } else if (a === 'ms-toggle') {
      const mid = act.closest('[data-mid]').dataset.mid;
      const g = getState().goals.find((x) => x.id === id);
      const wasDone = goalProgress(g) >= 100;
      update((st) => { const m = st.goals.find((x) => x.id === id).milestones.find((x) => x.id === mid); m.done = !m.done; });
      haptic(12);
      const now = goalProgress(getState().goals.find((x) => x.id === id));
      if (!wasDone && now >= 100) toast('🎯 Doel behaald! Sterk werk.');
    } else if (a === 'ms-del') {
      const mid = act.closest('[data-mid]').dataset.mid;
      update((st) => { const g = st.goals.find((x) => x.id === id); g.milestones = g.milestones.filter((x) => x.id !== mid); });
    } else if (a === 'edit') {
      openGoalSheet(getState().goals.find((x) => x.id === id));
    } else if (a === 'del') {
      if (!confirm('Dit doel en alle mijlpalen verwijderen?')) return;
      openIds.delete(id);
      update((st) => { st.goals = st.goals.filter((x) => x.id !== id); });
    }
  });
  list.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.closest('[data-act="ms-add"]'); if (!form) return;
    const id = form.closest('[data-id]').dataset.id;
    const text = form.text.value.trim(); if (!text) return;
    update((st) => { st.goals.find((x) => x.id === id).milestones.push({ id: uid(), text, done: false }); });
    requestAnimationFrame(() => document.querySelector(`[data-id="${id}"] [data-act="ms-add"] .input`)?.focus());
  });
}

function openGoalSheet(goal = null) {
  const g = goal ? { ...goal } : { title: '', why: '', category: 'Persoonlijk', deadline: '', milestones: [] };
  openSheet(`
    <h2>${goal ? 'Doel bewerken' : 'Nieuw doel'}</h2>
    <form id="goal-form" autocomplete="off">
      <div class="field"><label for="g-title">Doel</label><input class="input" id="g-title" name="title" required maxlength="80" placeholder="Bijv. Halve marathon lopen" value="${esc(g.title)}"></div>
      <div class="field"><label for="g-why">Waarom is dit belangrijk?</label><input class="input" id="g-why" name="why" maxlength="140" placeholder="Je motivatie, kort" value="${esc(g.why)}"></div>
      <div class="field"><label>Categorie</label>
        <div class="chips" id="g-cat">${CATEGORIES.map((c) => `<button type="button" class="chip ${c === g.category ? 'on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>
      </div>
      <div class="field"><label for="g-dl">Deadline (optioneel)</label><input class="input" type="date" id="g-dl" name="deadline" value="${esc(g.deadline)}"></div>
      ${goal ? '' : `<div class="field"><label for="g-ms">Mijlpalen (één per regel)</label><textarea class="textarea" id="g-ms" name="ms" placeholder="Eerste stap&#10;Tweede stap&#10;…"></textarea></div>`}
      <button class="btn block">${goal ? 'Opslaan' : 'Doel aanmaken'}</button>
    </form>
  `, (sheet) => {
    sheet.querySelector('#g-cat').addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      g.category = b.dataset.c;
      sheet.querySelectorAll('#g-cat .chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    sheet.querySelector('#goal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const title = f.title.value.trim(); if (!title) return;
      if (goal) {
        update((st) => { Object.assign(st.goals.find((x) => x.id === goal.id), { title, why: f.why.value.trim(), category: g.category, deadline: f.deadline.value }); });
        toast('Doel bijgewerkt');
      } else {
        const milestones = (f.ms.value || '').split('\n').map((x) => x.trim()).filter(Boolean).map((text) => ({ id: uid(), text, done: false }));
        const id = uid();
        openIds.add(id);
        update((st) => { st.goals.push({ id, title, why: f.why.value.trim(), category: g.category, deadline: f.deadline.value, milestones, createdAt: today() }); });
        toast('Doel aangemaakt');
      }
      closeSheet();
      haptic(15);
    });
    if (!goal) setTimeout(() => sheet.querySelector('#g-title').focus(), 350);
  });
}
