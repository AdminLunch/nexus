// NEXUS — datalaag. Alles staat lokaal op het toestel (localStorage).
import { normalizeState } from './schema.js';
const KEY = 'nexus.v1';
const SCHEMA = 1;

// ---------- datum-hulpjes (lokale tijd, niet UTC) ----------
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const today = () => dateKey(new Date());
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return dateKey(dt);
}
export function lastDays(n, end = today()) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- standaardstaat ----------
export function defaults() {
  return {
    schema: SCHEMA,
    createdAt: today(),
    settings: {
      name: '',
      sleepTarget: 8,
      weeklyTrainingTarget: 150,
      kcalTarget: 2200,
      proteinTarget: 140,
      waterTarget: 8,
      aiProvider: 'local',
      aiEndpoint: '',
      aiModel: '',
      aiKey: '',
    },
    priorities: {},   // { 'YYYY-MM-DD': [{id, text, done}] }
    moods: {},        // { date: {mood 1-5, energy 0-10} }
    reflections: {},  // { date: text }
    habits: [
      { id: 'h-water', name: 'Water drinken', icon: '💧' },
      { id: 'h-read', name: 'Lezen', icon: '📖' },
      { id: 'h-move', name: 'Bewegen', icon: '⚡' },
      { id: 'h-calm', name: 'Meditatie', icon: '🧘' },
    ],
    habitLog: {},     // { date: [habitId] }
    sleep: {},        // { date (ochtend van ontwaken): {hours, quality 1-5} }
    workouts: [],     // [{id, date, type, minutes, intensity 1-5, source?}]
    health: {},       // { date: {steps, rhr, hrv} } — uit Apple Gezondheid
    healthImportedAt: null,
    meals: {},        // { date: [{id, name, slot, kcal, protein, carbs, fat}] } — grammen
    water: {},        // { date: aantal glazen (250 ml) }
    goals: [],        // [{id, title, why, category, deadline, milestones:[{id,text,done}], createdAt}]
    chat: [],         // [{role:'user'|'bot', text, t}]
  };
}

// ---------- opslag ----------
let state = null;
let storageOk = true;
const listeners = new Set();

function migrate(s) {
  const base = defaults();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  for (const k of ['priorities', 'moods', 'reflections', 'habitLog', 'sleep', 'health', 'meals', 'water']) if (typeof out[k] !== 'object' || Array.isArray(out[k]) || !out[k]) out[k] = {};
  for (const k of ['habits', 'workouts', 'goals', 'chat']) if (!Array.isArray(out[k])) out[k] = base[k];
  out.schema = SCHEMA;
  // Typecontrole: geldige gegevens blijven gelijk, gemanipuleerde waarden worden onschadelijk.
  return normalizeState(out, base);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw)) : defaults();
  } catch (e) {
    storageOk = false;
    state = defaults();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
    console.warn('NEXUS: opslaan mislukt', e);
  }
}

export const isStorageOk = () => storageOk;
export const getState = () => state;

/** Muteer de staat, sla op en meld het aan luisteraars. */
export function update(fn, { silent = false } = {}) {
  fn(state);
  save();
  if (!silent) listeners.forEach((l) => l(state));
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Grootste back-up die we accepteren (localStorage zelf is ± 5 MB). */
export const MAX_BACKUP_BYTES = 15 * 1024 * 1024;

/**
 * Back-up als tekst. De API-sleutel gaat standaard NIET mee; app.js staat dat alleen toe
 * in een versleutelde back-up.
 */
export function exportJSON({ includeKey = false } = {}) {
  const data = structuredClone(state);
  if (!includeKey) data.settings.aiKey = '';
  return JSON.stringify({ app: 'NEXUS', exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Lees een back-upbestand (tekst) in. Controleert grootte en JSON; versleuteld blijft versleuteld. */
export function readBackup(text) {
  const t = String(text ?? '');
  if (t.length > MAX_BACKUP_BYTES) throw new Error('Bestand is te groot voor een NEXUS-back-up');
  try { return JSON.parse(t); } catch (_) { throw new Error('Geen geldig NEXUS-back-upbestand (geen JSON)'); }
}

/**
 * Zet een (onversleutelde) back-up terug. Alle gegevens gaan door de typecontrole.
 * Bevat de back-up geen API-sleutel, dan blijft de sleutel op dit toestel staan.
 */
export function importJSON(input) {
  const parsed = typeof input === 'string' ? readBackup(input) : input;
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('settings' in data)) throw new Error('Geen geldig NEXUS-back-upbestand');
  const keepKey = state?.settings?.aiKey || '';
  state = migrate(data);
  if (!state.settings.aiKey && keepKey) state.settings.aiKey = keepKey;
  save();
  listeners.forEach((l) => l(state));
}
export function resetAll() {
  state = defaults();
  save();
  listeners.forEach((l) => l(state));
}

/** Vraag de browser om de opslag niet automatisch op te ruimen. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (_) { /* niet ondersteund */ }
  return false;
}

// ---------- afgeleide gegevens ----------
export function prioritiesFor(d) { return state.priorities[d] || []; }
export function habitsDoneOn(d) { return state.habitLog[d] || []; }

export function toggleHabit(id, d = today()) {
  update((st) => {
    const log = (st.habitLog[d] ||= []);
    const i = log.indexOf(id);
    if (i >= 0) log.splice(i, 1); else log.push(id);
  });
}

export function habitStreak(habitId, end = today()) {
  let streak = 0;
  let d = end;
  // Vandaag nog niet gedaan breekt de reeks niet: tel dan vanaf gisteren.
  if (!habitsDoneOn(d).includes(habitId)) d = addDays(d, -1);
  while (habitsDoneOn(d).includes(habitId)) { streak++; d = addDays(d, -1); }
  return streak;
}

/**
 * Verwerk een geparste Gezondheid-import (zie health.js). Slaapuren worden
 * overschreven, een zelf ingevulde slaapkwaliteit blijft staan. Trainingen
 * worden niet dubbel toegevoegd. Geeft een korte samenvatting terug.
 */
export function applyHealth({ sleep, days, workouts }) {
  let nSleep = 0, nDays = 0, nWork = 0;
  update((st) => {
    for (const [d, hours] of Object.entries(sleep)) {
      st.sleep[d] = { quality: 3, ...st.sleep[d], hours, source: 'health' };
      nSleep++;
    }
    for (const [d, vals] of Object.entries(days)) {
      st.health[d] = { ...st.health[d], ...vals };
      nDays++;
    }
    for (const w of workouts) {
      // Apple Watch en Whoop kunnen dezelfde training allebei melden: binnen 10 minuten = dezelfde.
      const dup = st.workouts.some((x) => x.source === 'health' && x.date === w.date && Math.abs((x.start || 0) - w.start) < 10 * 60e3);
      if (dup) continue;
      st.workouts.push({ id: uid(), date: w.date, type: w.type, minutes: w.minutes, intensity: 3, start: w.start, source: 'health' });
      nWork++;
    }
    st.healthImportedAt = new Date().toISOString();
  });
  return { nSleep, nDays, nWork };
}

// ---------- voeding ----------
export const MEAL_SLOTS = [
  { id: 'ontbijt', l: 'Ontbijt', e: '🥣' },
  { id: 'lunch', l: 'Lunch', e: '🥪' },
  { id: 'diner', l: 'Diner', e: '🍽️' },
  { id: 'snack', l: 'Snack', e: '🍎' },
];
/** Logisch moment voor een maaltijd op basis van het uur. */
export function slotForHour(h = new Date().getHours()) {
  if (h < 10) return 'ontbijt';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'diner';
  return 'snack';
}
export function mealsFor(d) { return state.meals[d] || []; }

/** Totalen voor één dag: { kcal, protein, carbs, fat, n }. */
export function nutritionTotals(d) {
  const out = { kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0 };
  for (const m of mealsFor(d)) {
    out.kcal += Number(m.kcal) || 0;
    out.protein += Number(m.protein) || 0;
    out.carbs += Number(m.carbs) || 0;
    out.fat += Number(m.fat) || 0;
    out.n++;
  }
  for (const k of ['kcal', 'protein', 'carbs', 'fat']) out[k] = Math.round(out[k]);
  return out;
}

const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0; };

export function addMeal(d, meal) {
  const m = { id: uid(), name: String(meal.name || '').trim() || 'Maaltijd', slot: meal.slot || slotForHour(), kcal: Math.round(num(meal.kcal)), protein: num(meal.protein), carbs: num(meal.carbs), fat: num(meal.fat) };
  update((st) => { (st.meals[d] ||= []).push(m); });
  return m;
}
export function removeMeal(d, id) {
  update((st) => {
    st.meals[d] = (st.meals[d] || []).filter((m) => m.id !== id);
    if (!st.meals[d].length) delete st.meals[d];
  });
}

/** Recent gegeten, uniek op naam (nieuwste eerst) — voor snel opnieuw toevoegen. */
export function recentMeals(limit = 8, end = today()) {
  const seen = new Set();
  const out = [];
  for (const d of lastDays(30, end).reverse()) {
    for (const m of [...mealsFor(d)].reverse()) {
      const k = m.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Water bijstellen. Doel gehaald → gewoonte "Water drinken" (als die bestaat) wordt afgevinkt. */
export function changeWater(d, delta) {
  update((st) => {
    const v = Math.max(0, Math.min(30, (st.water[d] || 0) + delta));
    if (v) st.water[d] = v; else delete st.water[d];
    const target = st.settings.waterTarget || 8;
    if (st.habits.some((h) => h.id === 'h-water')) {
      const log = (st.habitLog[d] ||= []);
      const i = log.indexOf('h-water');
      if (v >= target && i < 0) log.push('h-water');
      if (v < target && i >= 0 && delta < 0) log.splice(i, 1);
    }
  });
}

export function workoutMinutes(days) {
  const set = new Set(days);
  return state.workouts.filter((w) => set.has(w.date)).reduce((s, w) => s + (Number(w.minutes) || 0), 0);
}

export function goalProgress(g) {
  if (!g.milestones.length) return g.done ? 100 : 0;
  return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
}

/**
 * Herstelscore 0–100 op basis van slaap, slaapkwaliteit, trainingsbelasting
 * van de afgelopen 2 dagen en stemming/energie. Geeft null als er te weinig data is.
 */
export function recoveryScore(d = today()) {
  const s = state.sleep[d];
  if (!s) return null;
  const target = state.settings.sleepTarget || 8;
  const sleepPart = Math.min(1, s.hours / target) * 45;              // max 45
  const qualityPart = ((s.quality || 3) / 5) * 25;                      // max 25
  const load = state.workouts
    .filter((w) => w.date === addDays(d, -1) || w.date === addDays(d, -2))
    .reduce((t, w) => t + (Number(w.minutes) || 0) * (Number(w.intensity) || 3), 0);
  const loadPart = Math.max(0, 20 - load / 30);                         // max 20, zware training trekt af
  const m = state.moods[d] || state.moods[addDays(d, -1)];
  const moodPart = m ? ((m.energy ?? 5) / 10) * 10 : 5;                 // max 10
  return Math.round(Math.max(0, Math.min(100, sleepPart + qualityPart + loadPart + moodPart)));
}

/** Dagscore voor het home-scherm: hoe "rond" is vandaag. */
export function dayScore(d = today()) {
  const parts = [];
  const p = prioritiesFor(d);
  if (p.length) parts.push(p.filter((x) => x.done).length / p.length);
  if (state.habits.length) parts.push(habitsDoneOn(d).filter((id) => state.habits.some((h) => h.id === id)).length / state.habits.length);
  parts.push(state.moods[d] ? 1 : 0);
  parts.push(state.sleep[d] ? 1 : 0);
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
}

// ---------- demo-data ----------
export function loadDemo() {
  const s = defaults();
  s.settings = { ...state.settings };
  const days = lastDays(28);
  const types = ['Kracht', 'Hardlopen', 'Fietsen', 'Wandelen', 'Yoga'];
  days.forEach((d, i) => {
    const wave = Math.sin(i / 3);
    s.moods[d] = { mood: Math.max(1, Math.min(5, Math.round(3.4 + wave * 1.2 + (Math.random() - .5)))), energy: Math.max(1, Math.min(10, Math.round(6 + wave * 2 + (Math.random() - .5) * 2))) };
    s.sleep[d] = { hours: Math.round((7 + wave * .8 + (Math.random() - .5)) * 4) / 4, quality: Math.max(1, Math.min(5, Math.round(3.5 + wave))) };
    s.habitLog[d] = s.habits.filter(() => Math.random() > .35).map((h) => h.id);
    if (i % 2 === 0 || Math.random() > .7) s.workouts.push({ id: uid(), date: d, type: types[i % types.length], minutes: 25 + Math.round(Math.random() * 45), intensity: 2 + Math.round(Math.random() * 3) });
    const dayMeals = [
      ['ontbijt', 'Havermout met banaan', 420, 14, 70, 9],
      ['lunch', 'Volkoren broodjes kip', 560, 38, 58, 16],
      ['diner', i % 3 ? 'Rijst, zalm en groente' : 'Pasta bolognese', i % 3 ? 680 : 760, i % 3 ? 42 : 36, 75, i % 3 ? 22 : 24],
      ['snack', 'Kwark met noten', 260, 24, 12, 13],
    ];
    s.meals[d] = dayMeals.filter((x, j) => j < 3 || Math.random() > .4).map(([slot, name, kcal, protein, carbs, fat]) => ({ id: uid(), slot, name, kcal: kcal + Math.round((Math.random() - .5) * 80), protein, carbs, fat }));
    s.water[d] = 5 + Math.round(Math.random() * 4);
    if (i < 27) s.reflections[d] = i % 4 === 0 ? 'Goede focus vandaag, weinig afleiding.' : '';
  });
  const t = today();
  delete s.moods[t]; delete s.habitLog[t];
  s.meals[t] = s.meals[t].filter((m) => m.slot === 'ontbijt');
  s.water[t] = 3;
  s.priorities[t] = [
    { id: uid(), text: 'Deep work: 90 minuten zonder telefoon', done: false },
    { id: uid(), text: 'Training — kracht bovenlichaam', done: true },
    { id: uid(), text: 'Weekplanning maken', done: false },
  ];
  s.priorities[addDays(t, -1)] = [{ id: uid(), text: 'Belastingpapieren uitzoeken', done: false }];
  s.goals = [
    { id: uid(), title: '10 km onder de 50 minuten', why: 'Fitter en meer energie', category: 'Gezondheid', deadline: addDays(t, 75), createdAt: addDays(t, -20),
      milestones: [{ id: uid(), text: '5 km zonder stoppen', done: true }, { id: uid(), text: '3x per week lopen, 4 weken lang', done: true }, { id: uid(), text: '8 km onder 42 min', done: false }, { id: uid(), text: '10 km race', done: false }] },
    { id: uid(), title: 'NEXUS uitbouwen', why: 'Eén plek voor focus en overzicht', category: 'Project', deadline: addDays(t, 30), createdAt: addDays(t, -2),
      milestones: [{ id: uid(), text: 'Eerste versie online', done: true }, { id: uid(), text: 'Op iPhone beginscherm', done: false }, { id: uid(), text: 'Eigen gewoontes instellen', done: false }] },
    { id: uid(), title: '12 boeken dit jaar', why: '', category: 'Persoonlijk', deadline: `${t.slice(0, 4)}-12-31`, createdAt: addDays(t, -200),
      milestones: Array.from({ length: 12 }, (_, i) => ({ id: uid(), text: `Boek ${i + 1}`, done: i < 8 })) },
  ];
  state = s;
  save();
  listeners.forEach((l) => l(state));
}
