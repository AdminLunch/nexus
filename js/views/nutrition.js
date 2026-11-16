// NEXUS — Body › Voeding, Inzichten en Kennis.
// Eetmomenten en bouwstenen (uit de artifact-lijn) met optioneel calorieën en macro's (uit v1.3).
import { getState, today, addDays, lastDays, nutritionTotals } from '../store.js';
import { esc, icons, haptic, toast, ask, openSheet, closeSheet, barChart, ring, dayLabel, shortDate, prettyDate, nl } from '../ui.js';
import {
  SLOTS, MAIN_SLOTS, TAGS, BUILDING_BLOCKS, FOODS, slotById, tagById, mealsOn, eatenMeals, slotStatus, mainEatenCount, tagCounts,
  waterOn, planFor, recentMeals, nowTime, slotForTime, detectTags, saveMeal, skipSlot, deleteMeal, setWater, setPlan,
} from '../nutrition/data.js';
import { allInsights, METRICS, breakfastVs, regularityVs, correlations, strength, MIN_GROUP, MIN_CORR } from '../nutrition/insights.js';
import { LEVELS, TOPICS, FOOD_CARDS, DISCLAIMER, SOURCES } from '../nutrition/knowledge.js';

let nutDate = null;     // geselecteerde dag in het voedingsdashboard
let planDate = null;    // geselecteerde dag in de planning
let insightDays = 30;
let breakfastMetric = 'energy';
let corrMetric = 'focus';
let levelFilter = 'alle';
const openTopics = new Set();
const ideaIdx = {};

export function resetNutritionDates() { nutDate = null; planDate = null; }

const IDEAS = {
  ontbijt: ['Kwark met bessen en walnoten', 'Havermout met kefir en banaan', '2 eieren op volkorenbrood', 'Skyr met lijnzaad en fruit', 'Overnight oats met chiazaad'],
  lunch: ['Volkorenbrood met ei en salade', 'Linzensoep met volkorenbrood', 'Wrap met kip en groenten', 'Restje van gisteren', 'Hummus met groente en roggebrood'],
  diner: ['Zalm met groenten en aardappels', 'Bonenchili met rijst', 'Wokgroenten met tofu', 'Omelet met groenten', 'Makreel met salade en volkorenbrood'],
  snack: ['Handje noten', 'Appel met pindakaas', 'Kefir', 'Groene banaan', 'Yoghurt met bessen'],
};

function dayName(d) {
  const t = today();
  if (d === t) return 'Vandaag';
  if (d === addDays(t, -1)) return 'Gisteren';
  if (d === addDays(t, 1)) return 'Morgen';
  return `${dayLabel(d)} ${shortDate(d)}`;
}
const tagIcons = (tags) => (tags || []).map((t) => tagById(t)?.e || '').join('');

// =====================================================================
// Voedingsdashboard
// =====================================================================
export function renderNutrition(el, rerender) {
  const s = getState();
  const t = today();
  if (!nutDate || nutDate > t) nutDate = t;
  if (!planDate || planDate <= t) planDate = addDays(t, 1);
  const d = nutDate;
  const kcalOn = !!s.settings.trackKcal;
  const eatenMain = mainEatenCount(d);
  const plan = planFor(d);
  const water = waterOn(d);
  const target = s.settings.waterTarget || 8;
  const counts = tagCounts(d);
  const week = lastDays(7);
  const weekCounts = Object.fromEntries(TAGS.map((x) => [x.id, 0]));
  week.forEach((w) => { const c = tagCounts(w); for (const k in c) weekCounts[k] += c[k]; });

  const slotRow = (sl) => {
    const status = slotStatus(d, sl.id);
    const items = mealsOn(d).filter((m) => m.slot === sl.id && !m.skipped);
    const planned = plan[sl.id];
    let body = '';
    if (items.length) {
      body = items.map((m) => `<button class="meal-item" data-edit="${m.id}">
          <span class="mono">${esc(m.time || '')}</span>
          <span class="meal-text">${m.name ? esc(m.name) : '<i>Gegeten</i>'}${kcalOn && m.kcal ? ` <small class="mono">${m.kcal} kcal</small>` : ''}</span>
          <span class="meal-tags" aria-hidden="true">${tagIcons(m.tags)}</span>
        </button>`).join('');
    } else if (status === 'skipped') {
      body = `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="badge r">Overgeslagen</span>
        <button class="btn ghost sm" data-unskip="${sl.id}">Ongedaan maken</button></div>`;
    } else if (planned) {
      body = `<div class="planned">Gepland: <b>${esc(planned)}</b></div>`;
    }
    const actions = [];
    if (status === 'empty' && sl.main) {
      if (planned) actions.push(`<button class="btn sm" data-asplanned="${sl.id}">✓ Zoals gepland</button>`);
      else actions.push(`<button class="btn sm" data-quick="${sl.id}">✓ Gegeten</button>`);
      actions.push(`<button class="btn ghost sm" data-skip="${sl.id}">Overgeslagen</button>`);
      actions.push(`<button class="btn ghost sm" data-add="${sl.id}" aria-label="${sl.l} met details toevoegen">+ Details</button>`);
    } else if (sl.id === 'snack' || status === 'eaten') {
      actions.push(`<button class="btn ghost sm" data-add="${sl.id}">+ ${sl.id === 'snack' ? 'Tussendoortje' : 'Nog iets'}</button>`);
    } else if (status === 'skipped') {
      actions.push(`<button class="btn ghost sm" data-add="${sl.id}">Toch gegeten</button>`);
    }
    return `<div class="slot-row" data-status="${status}">
      <div class="slot-head">
        <span class="slot-ico" aria-hidden="true">${sl.e}</span>
        <b>${sl.l}</b>
        <span class="slot-state">${status === 'eaten' ? '✓' : status === 'skipped' ? '—' : ''}</span>
      </div>
      ${body ? `<div class="slot-body">${body}</div>` : ''}
      <div class="slot-actions">${actions.join('')}</div>
    </div>`;
  };

  const planDays = Array.from({ length: 7 }, (_, i) => addDays(t, i + 1));
  const p = planFor(planDate);

  el.innerHTML = `
    <section class="card" aria-label="Eetmomenten">
      <div class="card-head">
        <h2 class="card-title">Eetmomenten</h2>
        <div class="date-nav">
          <button class="icon-btn sm" id="nd-prev" aria-label="Vorige dag">‹</button>
          <span class="mono">${esc(dayName(d))}</span>
          <button class="icon-btn sm" id="nd-next" aria-label="Volgende dag" ${d >= t ? 'disabled' : ''}>›</button>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;margin:-4px 0 12px">
        <span class="card-note">${eatenMain}/3 hoofdmaaltijden${d === t ? ' vandaag' : ''}</span>
        <div class="dots" aria-hidden="true">${MAIN_SLOTS.map((sl) => `<i data-s="${slotStatus(d, sl.id)}"></i>`).join('')}</div>
      </div>
      <div class="slots">${SLOTS.map(slotRow).join('')}</div>
      <button class="btn block" id="add-meal" style="margin-top:12px">+ Maaltijd toevoegen</button>
    </section>

    ${kcalOn ? kcalCard(s, d) : ''}

    <section class="card" aria-label="Water">
      <div class="card-head"><h2 class="card-title">Water</h2><span class="card-note mono">${water}/${target} glazen</span></div>
      <div class="glasses" id="glasses">
        ${Array.from({ length: Math.max(target, water) }, (_, i) => `<button class="glass ${i < water ? 'on' : ''}" data-g="${i + 1}" aria-label="${i + 1} glazen"><span></span></button>`).join('')}
      </div>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn ghost sm" id="w-min" aria-label="Glas minder">−</button>
        <button class="btn sm" id="w-plus">+ Glas water</button>
      </div>
    </section>

    <section class="card" aria-label="Bouwstenen">
      <div class="card-head"><h2 class="card-title">Bouwstenen</h2><span class="card-note">${esc(dayName(d))} · 7 dagen</span></div>
      <div class="blocks">
        ${BUILDING_BLOCKS.map((id) => { const tg = tagById(id); return `<div class="block ${counts[id] ? 'on' : ''}">
          <span class="e">${tg.e}</span><b>${tg.l}</b><span class="mono">${counts[id]}×</span><small>${weekCounts[id]}× in 7 dagen</small></div>`; }).join('')}
      </div>
      <p class="card-note" style="margin:10px 0 0">Telt bronnen in je maaltijden, geen grammen. ${counts.snelsuiker || counts.cafeine ? `Ook gelogd: ${counts.snelsuiker ? `🍬 ${counts.snelsuiker}× ` : ''}${counts.cafeine ? `☕ ${counts.cafeine}×` : ''}` : ''}</p>
    </section>

    <section class="card" aria-label="Planning">
      <div class="card-head"><h2 class="card-title">Planning</h2><span class="card-note">${esc(dayName(planDate))}</span></div>
      <div class="suggest" id="plan-days">${planDays.map((pd) => `<button class="chip ${pd === planDate ? 'on' : ''}" data-pd="${pd}">${esc(dayName(pd))}</button>`).join('')}</div>
      <div class="plan-list">
        ${SLOTS.map((sl) => `<div class="plan-row">
          <span class="slot-ico" aria-hidden="true">${sl.e}</span>
          <input class="input" data-plan="${sl.id}" value="${esc(p[sl.id] || '')}" placeholder="${sl.l}…" maxlength="120" aria-label="Plan ${sl.l}">
          <button class="icon-btn" data-idea="${sl.id}" aria-label="Idee voor ${sl.l}">💡</button>
        </div>`).join('')}
      </div>
      <p class="card-note" style="margin:10px 0 0">Geplande maaltijden kun je op die dag met één tik afvinken.</p>
    </section>

    <section class="card" aria-label="Deze week">
      <div class="card-head"><h2 class="card-title">Deze week</h2><span class="card-note">7 dagen</span></div>
      <div class="week-grid" role="table" aria-label="Eetmomenten per dag">
        <span></span>${week.map((w) => `<span class="wg-day ${w === t ? 'today' : ''}">${dayLabel(w)}</span>`).join('')}
        ${SLOTS.map((sl) => `<span class="wg-label">${sl.e}</span>${week.map((w) => {
          const st = sl.id === 'snack' ? (eatenMeals(w).some((m) => m.slot === 'snack') ? 'eaten' : 'empty') : slotStatus(w, sl.id);
          return `<i data-s="${st}" title="${sl.l} ${w}: ${st === 'eaten' ? 'gegeten' : st === 'skipped' ? 'overgeslagen' : 'niet ingevuld'}"></i>`;
        }).join('')}`).join('')}
      </div>
      <div class="legend"><span><i class="lg" data-s="eaten"></i> gegeten</span><span><i class="lg" data-s="skipped"></i> overgeslagen</span><span><i class="lg" data-s="empty"></i> niet ingevuld</span></div>
      <div class="stack-gap"></div>
      <div class="card-note" style="margin-bottom:4px">WATER (GLAZEN)</div>
      ${week.some((w) => s.water[w]) ? barChart(week.map((w) => s.water[w] || 0), { labels: week.map(dayLabel), target, unit: ' glazen', height: 120 }) : '<div class="empty">Nog geen water gelogd.</div>'}
    </section>
  `;

  // ---- events ----
  el.querySelector('#nd-prev').addEventListener('click', () => { nutDate = addDays(nutDate, -1); rerender(); });
  el.querySelector('#nd-next').addEventListener('click', () => { if (nutDate < t) { nutDate = addDays(nutDate, 1); rerender(); } });
  el.querySelector('#add-meal').addEventListener('click', () => openMealSheet(d, null, d === t ? slotForTime() : 'snack'));

  el.querySelector('.slots').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) {
      const m = mealsOn(d).find((x) => x.id === b.dataset.edit);
      if (m) openMealSheet(d, m);
    } else if (b.dataset.quick) {
      saveMeal(d, { slot: b.dataset.quick, time: d === t ? nowTime() : '', name: '', tags: [] });
      haptic(12); toast(`${slotById(b.dataset.quick).l} gelogd`);
    } else if (b.dataset.asplanned) {
      const txt = plan[b.dataset.asplanned];
      saveMeal(d, { slot: b.dataset.asplanned, time: d === t ? nowTime() : '', name: txt, tags: detectTags(txt) });
      haptic(12); toast('Gelogd zoals gepland');
    } else if (b.dataset.skip) {
      skipSlot(d, b.dataset.skip); haptic(8);
    } else if (b.dataset.unskip) {
      const sk = mealsOn(d).find((m) => m.slot === b.dataset.unskip && m.skipped);
      if (sk) deleteMeal(d, sk.id);
    } else if (b.dataset.add) {
      openMealSheet(d, null, b.dataset.add);
    }
  });

  el.querySelector('#glasses').addEventListener('click', (e) => {
    const g = e.target.closest('[data-g]');
    if (!g) return;
    const n = Number(g.dataset.g);
    setWater(d, n === water ? n - 1 : n);
    haptic(6);
  });
  el.querySelector('#w-plus').addEventListener('click', () => { setWater(d, water + 1); haptic(6); });
  el.querySelector('#w-min').addEventListener('click', () => setWater(d, water - 1));

  el.querySelector('#plan-days').addEventListener('click', (e) => {
    const c = e.target.closest('[data-pd]');
    if (!c) return;
    planDate = c.dataset.pd; rerender();
  });
  el.querySelectorAll('[data-plan]').forEach((inp) => {
    inp.addEventListener('change', () => { setPlan(planDate, inp.dataset.plan, inp.value); toast('Planning opgeslagen'); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  });
  el.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', () => {
    const sl = b.dataset.idea;
    const list = IDEAS[sl];
    ideaIdx[sl] = ((ideaIdx[sl] ?? -1) + 1) % list.length;
    setPlan(planDate, sl, list[ideaIdx[sl]]);
    haptic(5);
  }));
}

// =====================================================================
// Optioneel: calorieën en macro's (v1.3), alleen als de gebruiker dat aanzet
// =====================================================================
function kcalCard(s, d) {
  const tot = nutritionTotals(d);
  const kcalTarget = s.settings.kcalTarget || 2200;
  const protTarget = s.settings.proteinTarget || 140;
  const pct = Math.round((tot.kcal / kcalTarget) * 100);
  const left = kcalTarget - tot.kcal;
  const w7 = lastDays(7, d);
  const kcal7 = w7.map((x) => nutritionTotals(x).kcal);
  const logged7 = kcal7.filter((v) => v > 0);
  const avg7 = logged7.length ? Math.round(logged7.reduce((a, b) => a + b, 0) / logged7.length) : null;
  const f1 = (n) => nl(Math.round(n * 10) / 10);
  return `
    <section class="card" aria-label="Calorieën en macro's">
      <div class="card-head"><h2 class="card-title">Calorieën en macro's</h2><span class="card-note">optioneel</span></div>
      <div class="readiness" style="margin-bottom:14px">
        ${ring(pct, { size: 104, label: tot.kcal, sub: `/ ${kcalTarget} kcal`, key: 'body-kcal' })}
        <div>
          ${tot.kcal ? (left >= 0 ? `<span class="badge">Nog ${left} kcal</span>` : `<span class="badge a">${-left} kcal boven richtwaarde</span>`) : '<span class="badge v">Nog geen kcal ingevuld</span>'}
          <h3 style="margin-top:8px">${f1(tot.protein)} <small class="card-note">/ ${protTarget} g eiwit</small></h3>
          <div class="bar"><i data-w="${Math.min(100, Math.round((tot.protein / protTarget) * 100))}" data-key="body-prot"></i></div>
          <p class="card-note" style="margin:8px 0 0">K ${f1(tot.carbs)} g · V ${f1(tot.fat)} g</p>
        </div>
      </div>
      ${logged7.length ? barChart(kcal7, { labels: w7.map(dayLabel), target: kcalTarget, unit: ' kcal', showValues: false, height: 120 }) : ''}
      <div class="legend"><span>Gemiddeld <b class="mono">${avg7 ?? '—'}</b> kcal</span><span>Uitzetten kan bij Instellingen</span></div>
    </section>`;
}

// =====================================================================
// Maaltijd toevoegen / bewerken
// =====================================================================
export function openMealSheet(d, meal = null, slotDefault = 'snack') {
  const m = meal ? { ...meal, name: meal.name || '', tags: [...(meal.tags || [])] } : { slot: slotDefault, time: d === today() ? nowTime() : '', name: '', tags: [] };
  const kcalOn = !!getState().settings.trackKcal || !!meal?.kcal;
  const manualOn = new Set(meal ? m.tags.filter((x) => !detectTags(m.name).includes(x)) : []);
  const manualOff = new Set();
  const recent = recentMeals(8);
  const effectiveTags = () => [...new Set([...detectTags(m.name), ...manualOn])].filter((x) => !manualOff.has(x));

  openSheet(`
    <h2>${meal ? 'Maaltijd bewerken' : 'Maaltijd toevoegen'}</h2>
    <p class="hint" style="margin-top:-8px">${esc(prettyDate(d))}</p>
    <div class="field"><label>Eetmoment</label>
      <div class="chips" id="m-slot">${SLOTS.map((sl) => `<button type="button" class="chip ${sl.id === m.slot ? 'on' : ''}" data-s="${sl.id}">${sl.e} ${sl.l}</button>`).join('')}</div>
    </div>
    ${recent.length && !meal ? `<div class="field"><label>Opnieuw eten (één tik)</label>
      <div class="suggest" id="m-recent">${recent.map((r, i) => `<button type="button" class="chip" data-r="${i}">${esc(r.name)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label>Snel kiezen</label>
      <div class="chips food-chips" id="m-foods">${FOODS.map((f) => `<button type="button" class="chip" data-f="${f.id}">${f.e} ${esc(f.l)}</button>`).join('')}</div>
    </div>
    <div class="field"><label for="m-text">Wat at je? <span style="text-transform:none;letter-spacing:0">(optioneel)</span></label>
      <input class="input" id="m-text" maxlength="140" placeholder="Bijv. kwark met bessen" value="${esc(m.name)}" autocomplete="off">
    </div>
    ${kcalOn ? `<details class="field" ${meal?.kcal ? 'open' : ''}><summary class="card-note" style="cursor:pointer">Calorieën en macro's (optioneel)</summary>
      <div class="grid-2" style="margin-top:8px">
        <div class="field"><label for="m-kcal">kcal</label><input class="input" id="m-kcal" type="number" inputmode="numeric" min="0" max="5000" value="${m.kcal || ''}" placeholder="0"></div>
        <div class="field"><label for="m-p">Eiwit g</label><input class="input" id="m-p" type="number" inputmode="decimal" step="0.1" min="0" value="${m.protein || ''}" placeholder="0"></div>
        <div class="field"><label for="m-c">Koolh. g</label><input class="input" id="m-c" type="number" inputmode="decimal" step="0.1" min="0" value="${m.carbs || ''}" placeholder="0"></div>
        <div class="field"><label for="m-f">Vet g</label><input class="input" id="m-f" type="number" inputmode="decimal" step="0.1" min="0" value="${m.fat || ''}" placeholder="0"></div>
      </div>
      <p class="hint">Geen kcal maar wel macro's? Dan rekent NEXUS het uit (4 / 4 / 9 kcal per gram).</p>
    </details>` : ''}
    <div class="field"><label>Bouwstenen <span style="text-transform:none;letter-spacing:0">(automatisch herkend, tik om aan te passen)</span></label>
      <div class="chips" id="m-tags"></div>
    </div>
    <div class="field"><label for="m-time">Tijd</label><input class="input" type="time" id="m-time" value="${esc(m.time || '')}"></div>
    <button class="btn block" id="m-save">${meal ? 'Opslaan' : 'Toevoegen'}</button>
    ${meal ? '<button class="btn danger block" id="m-del" style="margin-top:10px">Verwijderen</button>' : ''}
  `, (sheet) => {
    const textEl = sheet.querySelector('#m-text');
    const drawTags = () => {
      const eff = effectiveTags();
      sheet.querySelector('#m-tags').innerHTML = TAGS.map((tg) => `<button type="button" class="chip ${eff.includes(tg.id) ? 'on' : ''}" data-t="${tg.id}">${tg.e} ${tg.l}</button>`).join('');
      sheet.querySelectorAll('#m-foods [data-f]').forEach((c) => {
        const f = FOODS.find((x) => x.id === c.dataset.f);
        c.classList.toggle('on', m.name.toLowerCase().includes(f.l.toLowerCase()));
      });
    };
    drawTags();
    sheet.querySelector('#m-slot').addEventListener('click', (e) => {
      const c = e.target.closest('[data-s]'); if (!c) return;
      m.slot = c.dataset.s;
      sheet.querySelectorAll('#m-slot .chip').forEach((x) => x.classList.toggle('on', x === c));
    });
    sheet.querySelector('#m-recent')?.addEventListener('click', (e) => {
      const c = e.target.closest('[data-r]'); if (!c) return;
      const r = recent[Number(c.dataset.r)];
      m.name = r.name; textEl.value = r.name;
      manualOn.clear(); manualOff.clear();
      (r.tags || []).forEach((x) => manualOn.add(x));
      drawTags(); haptic(5);
    });
    sheet.querySelector('#m-foods').addEventListener('click', (e) => {
      const c = e.target.closest('[data-f]'); if (!c) return;
      const f = FOODS.find((x) => x.id === c.dataset.f);
      const label = f.l.toLowerCase();
      const parts = m.name.split(',').map((x) => x.trim()).filter(Boolean);
      const idx = parts.findIndex((x) => x.toLowerCase() === label);
      if (idx >= 0) { parts.splice(idx, 1); f.tags.forEach((x) => manualOn.delete(x)); }
      else { parts.push(parts.length ? label : f.l); f.tags.forEach((x) => { manualOn.add(x); manualOff.delete(x); }); }
      m.name = parts.join(', ');
      textEl.value = m.name;
      drawTags(); haptic(4);
    });
    textEl.addEventListener('input', () => { m.name = textEl.value; drawTags(); });
    sheet.querySelector('#m-tags').addEventListener('click', (e) => {
      const c = e.target.closest('[data-t]'); if (!c) return;
      const id = c.dataset.t;
      if (effectiveTags().includes(id)) { manualOn.delete(id); manualOff.add(id); }
      else { manualOff.delete(id); manualOn.add(id); }
      drawTags();
    });
    sheet.querySelector('#m-save').addEventListener('click', () => {
      m.time = sheet.querySelector('#m-time').value;
      const macro = {};
      if (kcalOn) {
        const v = (id) => sheet.querySelector(id).value;
        const n = (x) => Number(String(x).replace(',', '.')) || 0;
        Object.assign(macro, { kcal: v('#m-kcal'), protein: v('#m-p'), carbs: v('#m-c'), fat: v('#m-f') });
        if (!n(macro.kcal)) macro.kcal = Math.round(n(macro.protein) * 4 + n(macro.carbs) * 4 + n(macro.fat) * 9);
      }
      saveMeal(d, { id: meal?.id, slot: m.slot, time: m.time, name: textEl.value, tags: effectiveTags(), ...macro });
      closeSheet(); haptic(12);
      toast(meal ? 'Maaltijd bijgewerkt' : `${slotById(m.slot).l} gelogd`);
    });
    sheet.querySelector('#m-del')?.addEventListener('click', async () => {
      if (!(await ask('Deze maaltijd verwijderen?', { ok: 'Verwijderen', danger: true }))) return;
      deleteMeal(d, meal.id); closeSheet();
    });
  });
}

// =====================================================================
// Inzichten
// =====================================================================
const fmt = (x) => (x == null ? '—' : nl(x));

function compareCard(title, res, metricKey, yesLabel, noLabel, extra = '') {
  const max = METRICS[metricKey].max;
  const bar = (v) => (v == null ? 0 : Math.round((v / max) * 100));
  let text;
  if (res.enough) {
    const abs = Math.abs(res.diff);
    const rel = abs / max;
    const size = rel < 0.05 ? 'nauwelijks verschil' : rel < 0.12 ? 'een klein verschil' : rel < 0.25 ? 'een duidelijk verschil' : 'een groot verschil';
    text = `Gemiddeld ${fmt(res.yes.mean)} ${yesLabel.toLowerCase()} tegenover ${fmt(res.no.mean)} ${noLabel.toLowerCase()}: <b>${size}</b> (${res.diff > 0 ? '+' : ''}${fmt(res.diff)} op een schaal tot ${max}). Dit is samenhang, geen bewijs van oorzaak.`;
  } else {
    text = `Nog te weinig gegevens: minimaal ${MIN_GROUP} dagen per groep nodig (nu ${res.yes.n} ${yesLabel.toLowerCase()}, ${res.no.n} ${noLabel.toLowerCase()}).`;
  }
  return `<section class="card" aria-label="${esc(title)}">
    <div class="card-head"><h2 class="card-title">${esc(title)}</h2>${extra}</div>
    <div class="cmp">
      <div class="cmp-row"><span>${yesLabel}</span><div class="bar"><i data-w="${bar(res.yes.mean)}"></i></div><b class="mono">${fmt(res.yes.mean)}</b><small>n=${res.yes.n}</small></div>
      <div class="cmp-row alt"><span>${noLabel}</span><div class="bar"><i data-w="${bar(res.no.mean)}"></i></div><b class="mono">${fmt(res.no.mean)}</b><small>n=${res.no.n}</small></div>
    </div>
    <p class="insight-text">${text}</p>
  </section>`;
}

export function renderInsights(el, rerender) {
  const s = getState();
  const days = lastDays(insightDays);
  const ins = allInsights(insightDays);
  const checkins = days.filter((d) => s.moods[d] && (s.moods[d].mood || s.moods[d].energy != null || s.moods[d].focus != null)).length;
  const bf = breakfastVs(days, breakfastMetric);
  const reg = regularityVs(days, 'mood');
  const corr = correlations(days, corrMetric);
  const r = ins.rhythm;
  const spreadWord = (m) => (m == null ? '' : m < 45 ? 'vrij vast' : m < 90 ? 'wisselend' : 'sterk wisselend');

  el.innerHTML = `
    <div class="chips" id="ins-range" style="margin-bottom:14px">
      ${[14, 30, 90].map((n) => `<button class="chip ${insightDays === n ? 'on' : ''}" data-n="${n}">${n} dagen</button>`).join('')}
    </div>

    <section class="card" aria-label="Gegevens">
      <div class="grid-2" style="gap:10px">
        <div><div class="k card-note">VOEDING GELOGD</div><b class="mono big">${ins.loggedDays}</b><span class="card-note"> / ${insightDays} dagen</span></div>
        <div><div class="k card-note">CHECK-INS (MIND)</div><b class="mono big">${checkins}</b><span class="card-note"> / ${insightDays} dagen</span></div>
      </div>
      ${ins.loggedDays < 7 ? '<p class="insight-text">Inzichten worden betrouwbaarder naarmate je langer registreert. Een snelle tik per eetmoment en een check-in onder Mind is genoeg.</p>' : ''}
    </section>

    <section class="card" aria-label="Eetmomenten">
      <div class="card-head"><h2 class="card-title">Welke momenten sla je over?</h2></div>
      ${ins.slots.map((sl) => {
        const tot = sl.eaten + sl.skipped + sl.empty || 1;
        return `<div class="split">
          <div class="split-head"><span>${sl.e} ${sl.l}</span><small>${sl.eaten} gegeten · ${sl.skipped} overgeslagen · ${sl.empty} leeg</small></div>
          <div class="split-bar"><i class="eaten" style="width:${(sl.eaten / tot) * 100}%"></i><i class="skipped" style="width:${(sl.skipped / tot) * 100}%"></i></div>
        </div>`;
      }).join('')}
      <p class="insight-text">${ins.mostSkipped
        ? `Je slaat <b>${esc(ins.mostSkipped.l.toLowerCase())}</b> het vaakst over: ${ins.mostSkipped.skipped} van de ${ins.mostSkipped.known} ingevulde dagen (${Math.round(ins.mostSkipped.skipRate * 100)}%).`
        : ins.slots.some((x) => x.skipped) ? 'Er zijn overgeslagen maaltijden, maar nog te weinig ingevulde dagen voor een patroon.' : 'Geen overgeslagen hoofdmaaltijden geregistreerd in deze periode.'}</p>
    </section>

    ${compareCard('Ontbijt en ' + METRICS[breakfastMetric].l.toLowerCase(), bf, breakfastMetric, 'Met ontbijt', 'Zonder ontbijt',
      `<div class="chips" id="bf-metric">${['energy', 'focus', 'mood'].map((k) => `<button class="chip ${breakfastMetric === k ? 'on' : ''}" data-m="${k}">${METRICS[k].l}</button>`).join('')}</div>`)}

    ${compareCard('Regelmaat en stemming', reg, 'mood', '3 hoofdmaaltijden', 'Minder dan 3')}

    <section class="card" aria-label="Eetritme">
      <div class="card-head"><h2 class="card-title">Eetritme</h2><span class="card-note">${r.n} dagen</span></div>
      ${r.n ? `<div class="grid-2" style="gap:10px">
        <div><div class="card-note">EERSTE MAALTIJD</div><b class="mono big">${r.first}</b><div class="card-note">${r.firstSpread != null ? `± ${r.firstSpread} min · ${spreadWord(r.firstSpread)}` : ''}</div></div>
        <div><div class="card-note">LAATSTE MAALTIJD</div><b class="mono big">${r.last ?? '—'}</b><div class="card-note">${r.lastSpread != null ? `± ${r.lastSpread} min · ${spreadWord(r.lastSpread)}` : ''}</div></div>
      </div>` : '<div class="empty">Log maaltijden met een tijd om je eetritme te zien.</div>'}
    </section>

    <section class="card" aria-label="Samenhang">
      <div class="card-head"><h2 class="card-title">Samenhang</h2>
        <div class="chips" id="corr-metric">${['focus', 'energy', 'mood'].map((k) => `<button class="chip ${corrMetric === k ? 'on' : ''}" data-m="${k}">${METRICS[k].l}</button>`).join('')}</div>
      </div>
      <p class="card-note" style="margin:-4px 0 10px">Hoe hangt ${METRICS[corrMetric].l.toLowerCase()} samen met… (−1 tot +1, minimaal ${MIN_CORR} dagen)</p>
      <div class="corr">
        ${corr.map((c) => { const st = strength(c.r); const w = c.r == null ? 0 : Math.abs(c.r) * 50; return `<div class="corr-row">
          <span class="corr-l">${esc(c.l)}</span>
          <div class="corr-bar"><i class="${c.r < 0 ? 'neg' : 'pos'}" style="width:${w}%;${c.r < 0 ? `right:50%` : 'left:50%'}"></i></div>
          <span class="corr-v mono">${c.enough ? (c.r == null ? '—' : (c.r > 0 ? '+' : '') + nl(c.r.toFixed(2))) : '…'}</span>
          <small class="corr-s">${c.enough ? `${st.l} · n=${c.n}` : `nog te weinig · n=${c.n}`}</small>
        </div>`; }).join('')}
      </div>
    </section>

    <section class="card note-card" aria-label="Hoe lees je dit">
      <div class="card-head"><h2 class="card-title">Hoe lees je dit?</h2></div>
      <ul class="plain">
        <li><b>Samenhang is geen oorzaak.</b> Op drukke dagen sla je misschien je ontbijt over én heb je minder energie — dan veroorzaakt het één het ander niet per se.</li>
        <li>Andere factoren tellen mee: slaap, stress, medicatie, werkdag of weekend.</li>
        <li>Alleen dagen waarop je iets hebt ingevuld tellen mee. Niets ingevuld is iets anders dan overgeslagen.</li>
        <li>Nieuwsgierig? Doe een klein experiment: twee weken elke dag ontbijten en kijk of het patroon verandert.</li>
      </ul>
    </section>
  `;

  el.querySelector('#ins-range').addEventListener('click', (e) => { const c = e.target.closest('[data-n]'); if (c) { insightDays = Number(c.dataset.n); rerender(); } });
  el.querySelector('#bf-metric').addEventListener('click', (e) => { const c = e.target.closest('[data-m]'); if (c) { breakfastMetric = c.dataset.m; rerender(); } });
  el.querySelector('#corr-metric').addEventListener('click', (e) => { const c = e.target.closest('[data-m]'); if (c) { corrMetric = c.dataset.m; rerender(); } });
}

// =====================================================================
// Kennis
// =====================================================================
export function renderKnowledge(el, rerender) {
  const filtered = (claims) => (levelFilter === 'alle' ? claims : claims.filter(([lv]) => lv === levelFilter));
  const topics = TOPICS.filter((tp) => filtered(tp.claims).length);
  const foods = levelFilter === 'alle' ? FOOD_CARDS : FOOD_CARDS.filter((f) => f.adhd[0] === levelFilter);

  el.innerHTML = `
    <section class="card disclaimer" aria-label="Let op">
      <b>Ondersteuning, geen behandeling</b>
      <p>${esc(DISCLAIMER)}</p>
    </section>

    <div class="chips" id="lvl" style="margin:4px 0 8px">
      <button class="chip ${levelFilter === 'alle' ? 'on' : ''}" data-l="alle">Alles</button>
      ${Object.entries(LEVELS).map(([k, v]) => `<button class="chip ${levelFilter === k ? 'on' : ''}" data-l="${k}">${v.l}</button>`).join('')}
    </div>
    <p class="card-note" style="margin:0 2px 14px">${levelFilter === 'alle' ? 'Elke uitspraak heeft een label voor de sterkte van het bewijs.' : esc(LEVELS[levelFilter].d)}</p>

    <div id="topics">
      ${topics.map((tp) => {
        const open = openTopics.has(tp.id) || levelFilter !== 'alle';
        return `<article class="card topic ${open ? 'open' : ''}" data-id="${tp.id}">
          <button class="topic-head" data-toggle aria-expanded="${open}">
            <span class="slot-ico" aria-hidden="true">${tp.e}</span><b>${esc(tp.t)}</b>
            <span class="topic-lv">${[...new Set(tp.claims.map(([lv]) => lv))].map((lv) => `<i class="lv-dot ${LEVELS[lv].c}" title="${LEVELS[lv].l}"></i>`).join('')}</span>
            ${icons.chev}
          </button>
          <div class="topic-body">
            <p class="topic-intro">${esc(tp.intro)}</p>
            <ul class="claims">${filtered(tp.claims).map(([lv, txt]) => `<li><span class="badge ${LEVELS[lv].c}">${LEVELS[lv].l}</span><span>${esc(txt)}</span></li>`).join('')}</ul>
            ${tp.list ? `<div class="topic-list"><b>${esc(tp.list.t)}</b><ul class="plain">${tp.list.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="card-note">${esc(tp.list.foot)}</p></div>` : ''}
            <div class="prompt-box" style="margin:12px 0 0"><span>Wat kun je ermee</span>${esc(tp.tip)}</div>
          </div>
        </article>`;
      }).join('') || '<div class="card empty">Geen onderwerpen met dit label.</div>'}
    </div>

    <h2 class="section-title">Voedingsmiddelen</h2>
    <div class="food-cards">
      ${foods.map((f) => `<div class="card food-card">
        <div class="row" style="gap:10px"><span class="slot-ico">${f.e}</span><b>${esc(f.t)}</b><span class="badge ${LEVELS[f.adhd[0]].c}" style="margin-left:auto">${LEVELS[f.adhd[0]].l}</span></div>
        <p class="card-note" style="margin:8px 0 4px">${esc(f.what)}</p>
        <p style="margin:0;font-size:14px">${esc(f.adhd[1])}</p>
      </div>`).join('') || '<div class="card empty">Geen voedingsmiddelen met dit label.</div>'}
    </div>
    <p class="card-note" style="margin:10px 2px 0">${esc(SOURCES)}</p>
  `;

  el.querySelector('#lvl').addEventListener('click', (e) => { const c = e.target.closest('[data-l]'); if (c) { levelFilter = c.dataset.l; rerender(); } });
  el.querySelector('#topics').addEventListener('click', (e) => {
    const h = e.target.closest('[data-toggle]'); if (!h) return;
    const card = h.closest('[data-id]');
    const id = card.dataset.id;
    if (openTopics.has(id)) openTopics.delete(id); else openTopics.add(id);
    card.classList.toggle('open');
    h.setAttribute('aria-expanded', card.classList.contains('open'));
  });
}
