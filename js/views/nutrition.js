// NEXUS — voeding: calorieën, macro's en water. Wordt getoond op het Body-scherm.
import { getState, today, lastDays, mealsFor, nutritionTotals, addMeal, removeMeal, recentMeals, changeWater, MEAL_SLOTS, slotForHour } from '../store.js';
import { esc, ring, barChart, dayLabel, openSheet, closeSheet, icons, haptic, toast } from '../ui.js';

const slotOf = (id) => MEAL_SLOTS.find((x) => x.id === id) || MEAL_SLOTS.at(-1);
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Kaarten voor op het Body-scherm. */
export function nutritionCards(s, t) {
  const tot = nutritionTotals(t);
  const kcalTarget = s.settings.kcalTarget || 2200;
  const protTarget = s.settings.proteinTarget || 140;
  const waterTarget = s.settings.waterTarget || 8;
  const water = s.water[t] || 0;
  const pct = Math.round((tot.kcal / kcalTarget) * 100);
  const left = kcalTarget - tot.kcal;
  const macroKcal = tot.protein * 4 + tot.carbs * 4 + tot.fat * 9;
  const share = (g, f) => (macroKcal ? `${Math.round(((g * f) / macroKcal) * 100)}% kcal` : '—');
  const meals = [...mealsFor(t)].sort((a, b) => MEAL_SLOTS.findIndex((x) => x.id === a.slot) - MEAL_SLOTS.findIndex((x) => x.id === b.slot));

  const w7 = lastDays(7, t);
  const kcal7 = w7.map((d) => nutritionTotals(d).kcal);
  const logged7 = kcal7.filter((v) => v > 0);
  const avg7 = logged7.length ? Math.round(logged7.reduce((a, b) => a + b, 0) / logged7.length) : null;

  return `
    <section class="card" aria-label="Voeding">
      <div class="card-head"><h2 class="card-title">Voeding vandaag</h2><button class="btn sm" id="add-meal">+ Eten</button></div>
      <div class="readiness" style="margin-bottom:14px">
        ${ring(pct, { size: 104, label: tot.kcal, sub: `/ ${kcalTarget} kcal`, key: 'body-kcal' })}
        <div>
          ${tot.n ? (left >= 0 ? `<span class="badge">Nog ${left} kcal</span>` : `<span class="badge a">${-left} kcal boven doel</span>`) : '<span class="badge v">Nog niets gelogd</span>'}
          <h3 style="margin-top:8px">${fmt(tot.protein)} <small class="card-note">/ ${protTarget} g eiwit</small></h3>
          <div class="bar"><i data-w="${Math.min(100, Math.round((tot.protein / protTarget) * 100))}" data-key="body-prot"></i></div>
        </div>
      </div>
      <div class="grid-3">
        <div class="card tile"><div class="k">Eiwit</div><div class="v">${fmt(tot.protein)}<small>g</small></div><div class="s">${share(tot.protein, 4)}</div></div>
        <div class="card tile"><div class="k">Koolh.</div><div class="v">${fmt(tot.carbs)}<small>g</small></div><div class="s">${share(tot.carbs, 4)}</div></div>
        <div class="card tile"><div class="k">Vet</div><div class="v">${fmt(tot.fat)}<small>g</small></div><div class="s">${share(tot.fat, 9)}</div></div>
      </div>

      <div class="field" style="margin:16px 0 4px">
        <label>💧 Water <span class="mono" style="float:right;letter-spacing:0">${water ? fmt(water * 0.25) + ' L' : ''}</span></label>
        <div class="stepper">
          <button data-water="-1" aria-label="Glas minder">−</button>
          <div class="val"><span id="water-n">${water}</span><small> / ${waterTarget} glazen</small></div>
          <button data-water="1" aria-label="Glas erbij">+</button>
        </div>
      </div>

      <div id="meal-list" style="margin-top:10px">
        ${meals.map((m) => `
          <div class="list-row" data-id="${m.id}">
            <span class="ico">${slotOf(m.slot).e}</span>
            <span class="main"><b>${esc(m.name)}</b><small>${slotOf(m.slot).l}${m.protein || m.carbs || m.fat ? ` · E ${fmt(m.protein)} · K ${fmt(m.carbs)} · V ${fmt(m.fat)} g` : ''}</small></span>
            <span class="mono">${m.kcal}</span>
            <button class="del-btn" data-del-meal aria-label="Verwijder ${esc(m.name)}">${icons.x}</button>
          </div>`).join('') || '<div class="empty">Tik op + Eten om je eerste maaltijd te loggen.</div>'}
      </div>
    </section>

    <section class="card" aria-label="Calorieën 7 dagen">
      <div class="card-head"><h2 class="card-title">Calorieën 7 dagen</h2></div>
      ${logged7.length ? barChart(kcal7, { labels: w7.map(dayLabel), target: kcalTarget, unit: ' kcal', showValues: false }) : '<div class="empty">Nog geen maaltijden gelogd.</div>'}
      <div class="legend"><span>Gemiddeld <b class="mono">${avg7 ?? '—'}</b> kcal</span><span style="color:var(--amber)">- - doel ${kcalTarget}</span></div>
    </section>`;
}

/** Koppel de knoppen nadat nutritionCards() in de DOM staat. */
export function bindNutrition(el) {
  const t = today();
  el.querySelector('#add-meal').addEventListener('click', () => openMealSheet());
  el.querySelectorAll('[data-water]').forEach((b) => b.addEventListener('click', () => {
    const before = getState().water[t] || 0;
    changeWater(t, Number(b.dataset.water));
    const now = getState().water[t] || 0;
    haptic(8);
    if (before < (getState().settings.waterTarget || 8) && now >= (getState().settings.waterTarget || 8)) toast('💧 Waterdoel gehaald');
  }));
  el.querySelector('#meal-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del-meal]');
    if (!b) return;
    removeMeal(t, b.closest('[data-id]').dataset.id);
    haptic(10);
  });
}

function openMealSheet() {
  const m = { slot: slotForHour() };
  const recent = recentMeals(8);
  openSheet(`
    <h2>Eten loggen</h2>
    ${recent.length ? `<div class="field"><label>Snel opnieuw</label>
      <div class="chips" id="m-recent">${recent.map((r, i) => `<button class="chip" data-r="${i}">${esc(r.name)} · ${r.kcal}</button>`).join('')}</div>
    </div>` : ''}
    <form id="meal-form" autocomplete="off">
      <div class="field"><label for="m-name">Wat at je?</label><input class="input" id="m-name" name="name" maxlength="60" placeholder="Bijv. kwark met muesli" required></div>
      <div class="field"><label>Moment</label>
        <div class="chips" id="m-slot">${MEAL_SLOTS.map((x) => `<button type="button" class="chip ${x.id === m.slot ? 'on' : ''}" data-s="${x.id}">${x.e} ${x.l}</button>`).join('')}</div>
      </div>
      <div class="field"><label for="m-kcal">Calorieën (kcal)</label><input class="input" id="m-kcal" name="kcal" type="number" inputmode="numeric" min="0" max="5000" placeholder="0"></div>
      <div class="grid-3">
        <div class="field"><label for="m-p">Eiwit g</label><input class="input" id="m-p" name="protein" type="number" inputmode="decimal" step="0.1" min="0" placeholder="0"></div>
        <div class="field"><label for="m-c">Koolh. g</label><input class="input" id="m-c" name="carbs" type="number" inputmode="decimal" step="0.1" min="0" placeholder="0"></div>
        <div class="field"><label for="m-f">Vet g</label><input class="input" id="m-f" name="fat" type="number" inputmode="decimal" step="0.1" min="0" placeholder="0"></div>
      </div>
      <p class="hint">Laat je kcal leeg maar vul je macro's in, dan rekent NEXUS de calorieën uit (4 / 4 / 9 kcal per gram).</p>
      <button class="btn block">Opslaan</button>
    </form>
  `, (sheet) => {
    const f = sheet.querySelector('#meal-form');
    sheet.querySelector('#m-slot').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      m.slot = b.dataset.s;
      sheet.querySelectorAll('#m-slot .chip').forEach((c) => c.classList.toggle('on', c === b));
    });
    sheet.querySelector('#m-recent')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = recent[Number(b.dataset.r)];
      f.name.value = r.name;
      f.kcal.value = r.kcal || '';
      f.protein.value = r.protein || '';
      f.carbs.value = r.carbs || '';
      f.fat.value = r.fat || '';
      sheet.querySelectorAll('#m-recent .chip').forEach((c) => c.classList.toggle('on', c === b));
      haptic(5);
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = (x) => Number(String(x).replace(',', '.')) || 0;
      let kcal = n(f.kcal.value);
      if (!kcal) kcal = n(f.protein.value) * 4 + n(f.carbs.value) * 4 + n(f.fat.value) * 9;
      const saved = addMeal(today(), { name: f.name.value, slot: m.slot, kcal, protein: f.protein.value, carbs: f.carbs.value, fat: f.fat.value });
      closeSheet();
      haptic(15);
      toast(`${saved.name} · ${saved.kcal} kcal opgeslagen`);
    });
  });
}
