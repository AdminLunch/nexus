// NEXUS — datalaag. Alles staat lokaal op het toestel (localStorage).
import { normalizeState } from './schema.js';
const KEY = 'nexus.v1';
// Schema-geschiedenis: 1 = app v1.0–v1.3.1 · 2 = Claude-artifact v1.2 (voeding als eetmomenten,
// gedachten, concentratie) · 3 = verenigde versie (beide voedingsmodellen in één maaltijd-record).
const SCHEMA = 3;

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
    updatedAt: 0,     // ms sinds 1970; voor (optionele) synchronisatie
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
      trackKcal: false,   // calorieën en macro's bijhouden is optioneel (standaard: alleen eetmomenten)
      cloudSync: false,   // alleen in Claude: privé synchroniseren via je Claude-account (standaard uit)
    },
    priorities: {},   // { 'YYYY-MM-DD': [{id, text, done}] }
    moods: {},        // { date: {mood 1-5, energy 0-10, focus 0-10} } — elk veld optioneel
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
    // { date: [{id, slot, name, time?, tags?:[], kcal?, protein?, carbs?, fat?} | {id, slot, skipped:true, time?}] }
    meals: {},
    water: {},        // { date: aantal glazen (250 ml) }
    mealPlan: {},     // { date: { ontbijt?: tekst, lunch?, diner?, snack? } }
    thoughts: [],     // [{id, date, t (ms), kind, text}] — blijft altijd op het toestel
    goals: [],        // [{id, title, why, category, deadline, milestones:[{id,text,done}], createdAt}]
    chat: [],         // [{role:'user'|'bot', text, t}]
    // Toestemming voor externe AI (zie js/privacy/consent.js). Standaard: niets delen.
    privacy: {
      ai: { textVersion: null, host: '', scopes: {}, decidedAt: null, updatedAt: null },
      aiLog: [],      // [{t, host, categories:[…], historyCount}] — nooit de inhoud
    },
  };
}

// ---------- opslag ----------
let state = null;
let storageOk = true;
const listeners = new Set();
let remoteSaver = null; // optioneel: schrijft de staat naar de Claude-opslag (zie js/cloud.js)

/**
 * Brengt oudere gegevensvormen naar het verenigde model, zonder iets weg te gooien:
 * - artifact v1.2: maaltijd.text → name, 'avond' → 'diner' (ook in mealPlan)
 * - calorieën bijhouden blijft aan voor wie al kcal invulde
 */
function upgradeShapes(s) {
  const out = { ...s };
  if (out.meals && typeof out.meals === 'object' && !Array.isArray(out.meals)) {
    const meals = {};
    for (const [d, list] of Object.entries(out.meals)) {
      meals[d] = Array.isArray(list) ? list.map((m) => {
        if (!m || typeof m !== 'object') return m;
        const r = { ...m };
        if (r.slot === 'avond') r.slot = 'diner';
        if ((r.name == null || r.name === '') && typeof r.text === 'string') r.name = r.text;
        delete r.text;
        return r;
      }) : list;
    }
    out.meals = meals;
  }
  if (out.mealPlan && typeof out.mealPlan === 'object' && !Array.isArray(out.mealPlan)) {
    const plan = {};
    for (const [d, p] of Object.entries(out.mealPlan)) {
      if (p && typeof p === 'object' && !Array.isArray(p)) {
        const q = { ...p };
        if ('avond' in q) { if (!q.diner) q.diner = q.avond; delete q.avond; }
        plan[d] = q;
      } else plan[d] = p;
    }
    out.mealPlan = plan;
  }
  const settings = out.settings && typeof out.settings === 'object' ? { ...out.settings } : {};
  if (typeof settings.trackKcal !== 'boolean') {
    settings.trackKcal = Object.values(out.meals || {}).some((l) => Array.isArray(l) && l.some((m) => Number(m?.kcal) > 0));
  }
  out.settings = settings;
  return out;
}

function migrate(raw) {
  const base = defaults();
  const s = upgradeShapes(raw);
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  for (const k of ['priorities', 'moods', 'reflections', 'habitLog', 'sleep', 'health', 'meals', 'water', 'mealPlan']) if (typeof out[k] !== 'object' || Array.isArray(out[k]) || !out[k]) out[k] = {};
  for (const k of ['habits', 'workouts', 'goals', 'chat', 'thoughts']) if (!Array.isArray(out[k])) out[k] = base[k];
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
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, json);
    storageOk = true;
  } catch (e) {
    // Opslag vol? Je actuele gegevens gaan vóór herstelpunten: ruim die op (oudste eerst) en probeer opnieuw.
    let points = restorePoints();
    while (points.length) {
      points = points.slice(0, -1);
      try {
        if (points.length) localStorage.setItem(RESTORE_KEY, JSON.stringify(points)); else localStorage.removeItem(RESTORE_KEY);
        localStorage.setItem(KEY, json);
        storageOk = true;
        return;
      } catch (_) { /* volgende proberen */ }
    }
    storageOk = false;
    console.warn('NEXUS: opslaan mislukt', e?.name || 'onbekende fout');
  }
}

// ---------- herstelpunten ----------
// Vóór elke actie die alles vervangt (back-up herstellen, demo-data, alles wissen) bewaren we
// een kopie op dit toestel. Maximaal 3; ze gaan nooit mee in een back-up.
const RESTORE_KEY = 'nexus.v1.restore';
export const MAX_RESTORE_POINTS = 3;

export function restorePoints() {
  try {
    const list = JSON.parse(localStorage.getItem(RESTORE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.data === 'string') : [];
  } catch (_) { return []; }
}

/** Bewaar de huidige staat als herstelpunt. Geeft het id terug, of null als het niet lukte (opslag vol). */
export function createRestorePoint(reason) {
  if (!state) return null;
  const entry = { id: uid(), t: new Date().toISOString(), reason: String(reason || ''), data: JSON.stringify(state) };
  let list = [entry, ...restorePoints()].slice(0, MAX_RESTORE_POINTS);
  while (list.length) {
    try { localStorage.setItem(RESTORE_KEY, JSON.stringify(list)); return entry.id; } catch (_) { list = list.slice(0, -1); if (!list.length || list[0] !== entry) break; }
  }
  return null;
}

/** Zet een herstelpunt terug. De huidige staat wordt eerst zelf een herstelpunt. */
export function restoreFrom(id) {
  const p = restorePoints().find((x) => x.id === id);
  if (!p) throw new Error('Herstelpunt niet gevonden');
  const data = JSON.parse(p.data);
  createRestorePoint('Vóór terugzetten herstelpunt');
  state = migrate(data);
  commit();
}

export function clearRestorePoints() {
  try { localStorage.removeItem(RESTORE_KEY); } catch (_) { /* */ }
}

export const isStorageOk = () => storageOk;
export const getState = () => state;

/** Muteer de staat, sla op (lokaal en eventueel in de Claude-opslag) en meld het aan luisteraars. */
export function update(fn, { silent = false } = {}) {
  fn(state);
  state.updatedAt = Date.now();
  save();
  if (remoteSaver) remoteSaver(state);
  if (!silent) listeners.forEach((l) => l(state));
}

const notifyAll = () => listeners.forEach((l) => l(state));
/** Vervang-acties (herstellen, demo, wissen): opslaan, eventueel synchroniseren, iedereen bijwerken. */
function commit() {
  state.updatedAt = Date.now();
  save();
  if (remoteSaver) remoteSaver(state);
  notifyAll();
}

/** Koppel (of ontkoppel met null) een externe opslag; saver(state) volgt na elke wijziging. */
export function setRemoteSaver(fn) { remoteSaver = typeof fn === 'function' ? fn : null; }

/** Neem een nieuwere staat uit de Claude-opslag over (gaat door dezelfde migratie en typecontrole). */
export function adoptRemote(data) {
  state = migrate(data);
  save();
  notifyAll();
}

/** Pure migratie, voor tests en voor het controleren van een back-up vóór het terugzetten. */
export const migrateForTest = (data) => migrate(data);
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
  commit();
}
export function resetAll() {
  state = defaults();
  commit();
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
    if (m.skipped) continue;
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
  if (meal.time) m.time = String(meal.time).slice(0, 5);
  if (Array.isArray(meal.tags) && meal.tags.length) m.tags = meal.tags.map(String);
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
      if (m.skipped || !m.name) continue;
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
  parts.push(state.moods[d]?.mood ? 1 : 0);
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
    // Voeding (fictief): eetmomenten met bouwstenen; kcal alleen als voorbeeld voor wie dat bijhoudt.
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const skipBreakfast = (i % 5 === 1) || (i % 7 === 3);
    const meals = [];
    if (skipBreakfast) meals.push({ id: uid(), slot: 'ontbijt', skipped: true, time: '08:30' });
    else meals.push({ id: uid(), slot: 'ontbijt', time: pick(['07:15', '07:45', '08:10']), ...pick([
      { name: 'Havermout met bessen en walnoten', tags: ['vezels', 'groentefruit', 'omega3'], kcal: 420, protein: 14, carbs: 62, fat: 13 },
      { name: 'Kwark met banaan en lijnzaad', tags: ['eiwit', 'groentefruit', 'omega3', 'vezels'], kcal: 360, protein: 28, carbs: 40, fat: 8 },
      { name: '2 eieren op volkorenbrood', tags: ['eiwit', 'vezels'], kcal: 380, protein: 22, carbs: 30, fat: 17 },
    ]) });
    if (i % 6 === 2) meals.push({ id: uid(), slot: 'lunch', skipped: true, time: '13:00' });
    else meals.push({ id: uid(), slot: 'lunch', time: pick(['12:15', '12:40', '13:20']), ...pick([
      { name: 'Volkorenbrood met kip en salade', tags: ['eiwit', 'vezels', 'groentefruit'], kcal: 560, protein: 38, carbs: 58, fat: 16 },
      { name: 'Linzensoep', tags: ['eiwit', 'vezels'], kcal: 420, protein: 22, carbs: 55, fat: 9 },
    ]) });
    meals.push({ id: uid(), slot: 'diner', time: pick(['18:00', '18:30', '19:15']), ...pick([
      { name: 'Zalm met broccoli en zilvervliesrijst', tags: ['eiwit', 'omega3', 'groentefruit', 'vezels'], kcal: 680, protein: 42, carbs: 70, fat: 22 },
      { name: 'Pasta met gehakt en groenten', tags: ['eiwit', 'groentefruit'], kcal: 760, protein: 36, carbs: 85, fat: 24 },
      { name: 'Bonenschotel met paprika', tags: ['eiwit', 'vezels', 'groentefruit'], kcal: 620, protein: 30, carbs: 80, fat: 14 },
    ]) });
    if (i % 3 === 0) meals.push({ id: uid(), slot: 'snack', time: '15:30', ...pick([
      { name: 'Handje noten', tags: ['eiwit', 'vezels'], kcal: 180, protein: 6, carbs: 6, fat: 15 },
      { name: 'Appel', tags: ['groentefruit'], kcal: 80, protein: 0, carbs: 20, fat: 0 },
    ]) });
    s.meals[d] = meals;
    s.water[d] = 3 + Math.round(Math.random() * 5);
    s.moods[d].focus = Math.max(1, Math.min(10, s.moods[d].energy + (skipBreakfast ? -2 : 0) + Math.round(Math.random() * 2 - 1)));
    if (i % 5 === 0) s.thoughts.push({ id: uid(), date: d, t: Date.now() - (27 - i) * 86400000, kind: ['idee', 'dankbaar', 'taak'][i % 3], text: ['Idee voor het weekend: fietstocht', 'Fijne wandeling gehad', 'Tandarts bellen'][i % 3] });
    if (i < 27) s.reflections[d] = i % 4 === 0 ? 'Goede focus vandaag, weinig afleiding.' : '';
  });
  const t = today();
  delete s.moods[t]; delete s.habitLog[t];
  s.meals[t] = s.meals[t].filter((m) => m.slot === 'ontbijt');
  s.mealPlan[addDays(t, 1)] = { ontbijt: 'Kwark met bessen en walnoten', lunch: 'Restje bonenschotel' };
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
  commit();
}
