// NEXUS — datalaag.
// Gegevens staan direct in de browser (localStorage, als snelle cache) en worden,
// zodra je ingelogd bent bij Claude, ook privé in je account bewaard (cloud-sync).
const KEY = 'nexus.v1';
const SCHEMA = 2; // v1.2: voeding (meals, water, mealPlan) + concentratie in moods

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
  return dateKey(new Date(y, m - 1, d + n, 12));
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
    updatedAt: 0,     // ms; 0 = nog nooit gewijzigd
    settings: {
      name: '',
      sleepTarget: 8,
      weeklyTrainingTarget: 150,
      aiProvider: 'claude',
      waterTarget: 8,
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
    workouts: [],     // [{id, date, type, minutes, intensity 1-5}]
    goals: [],        // [{id, title, why, category, deadline, milestones:[{id,text,done}], createdAt}]
    chat: [],         // [{role:'user'|'bot', text, t}]
    // ---- v1.2: voeding ----
    meals: {},        // { date: [{id, slot:'ontbijt'|'lunch'|'avond'|'snack', time:'HH:MM', text, tags:[]} | {id, slot, skipped:true}] }
    water: {},        // { date: glazen }
    mealPlan: {},     // { date: { ontbijt?: tekst, lunch?, avond?, snack? } }
    // ---- v1.2: gedachten (Mind) ----
    thoughts: [],     // [{id, date, t (ms), kind: 'idee'|'zorg'|'piekeren'|'dankbaar'|'taak'|'overig', text}]
  };
}

// ---------- opslag ----------
let state = null;
let storageOk = true;
const listeners = new Set();
let remoteSaver = null; // functie die de staat naar de cloud schrijft

function migrate(s) {
  const base = defaults();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  for (const k of ['priorities', 'moods', 'reflections', 'habitLog', 'sleep', 'meals', 'water', 'mealPlan']) if (typeof out[k] !== 'object' || Array.isArray(out[k]) || !out[k]) out[k] = {};
  for (const k of ['habits', 'workouts', 'goals', 'chat', 'thoughts']) if (!Array.isArray(out[k])) out[k] = base[k];
  if (!['local', 'claude'].includes(out.settings.aiProvider)) out.settings.aiProvider = 'claude';
  out.updatedAt = Number(out.updatedAt) || 0;
  out.schema = SCHEMA;
  return out;
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

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
}

function persist() {
  state.updatedAt = Date.now();
  saveLocal();
  if (remoteSaver) remoteSaver(state);
}

const notify = () => listeners.forEach((l) => l(state));

export const isStorageOk = () => storageOk;
export const getState = () => state;

/** Muteer de staat, sla op (lokaal + cloud) en meld het aan luisteraars. */
export function update(fn, { silent = false } = {}) {
  fn(state);
  persist();
  if (!silent) notify();
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Koppel een cloud-opslag. saver(state) wordt na elke wijziging aangeroepen. */
export function setRemoteSaver(fn) { remoteSaver = fn; }

/** Vervang de staat door een (nieuwere) versie uit de cloud. */
export function adoptRemote(data) {
  state = migrate(data);
  saveLocal();
  notify();
}

export function exportJSON() {
  return JSON.stringify({ app: 'NEXUS', exportedAt: new Date().toISOString(), data: state }, null, 2);
}
export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !('settings' in data)) throw new Error('Geen geldig NEXUS-back-upbestand');
  state = migrate(data);
  persist();
  notify();
}
export function resetAll() {
  state = defaults();
  persist();
  notify();
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
 * van de afgelopen 2 dagen en stemming/energie. null als er geen slaapdata is.
 */
export function recoveryScore(d = today()) {
  const s = state.sleep[d];
  if (!s) return null;
  const target = state.settings.sleepTarget || 8;
  const sleepPart = Math.min(1, s.hours / target) * 45;
  const qualityPart = ((s.quality || 3) / 5) * 25;
  const load = state.workouts
    .filter((w) => w.date === addDays(d, -1) || w.date === addDays(d, -2))
    .reduce((t, w) => t + (Number(w.minutes) || 0) * (Number(w.intensity) || 3), 0);
  const loadPart = Math.max(0, 20 - load / 30);
  const m = state.moods[d] || state.moods[addDays(d, -1)];
  const moodPart = m ? ((m.energy ?? 5) / 10) * 10 : 5;
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
    if (i < 27 && i % 4 === 0) s.reflections[d] = 'Goede focus vandaag, weinig afleiding.';
    // voeding (demo): ontbijt soms overgeslagen, water wisselend
    if (i < 27) {
      const skipBreakfast = (i % 5 === 1) || (i % 7 === 3);
      const meals = [];
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (skipBreakfast) meals.push({ id: uid(), slot: 'ontbijt', skipped: true, time: '08:30' });
      else meals.push(pick([
        { text: 'Havermout met bessen en walnoten', tags: ['vezels', 'groentefruit', 'omega3'] },
        { text: 'Kwark met banaan en lijnzaad', tags: ['eiwit', 'groentefruit', 'omega3', 'vezels'] },
        { text: '2 eieren op volkorenbrood', tags: ['eiwit', 'vezels'] },
        { text: 'Kefir met havermout', tags: ['gefermenteerd', 'eiwit', 'vezels'] },
      ]));
      if (!skipBreakfast) Object.assign(meals[0], { id: uid(), slot: 'ontbijt', time: pick(['07:15', '07:45', '08:10', '08:40']) });
      if (i % 6 === 2) meals.push({ id: uid(), slot: 'lunch', skipped: true, time: '13:00' });
      else meals.push({ id: uid(), slot: 'lunch', time: pick(['12:15', '12:40', '13:20']), ...pick([
        { text: 'Volkorenbrood met kip en salade', tags: ['eiwit', 'vezels', 'groentefruit'] },
        { text: 'Linzensoep', tags: ['eiwit', 'vezels'] },
        { text: 'Broodje kaas', tags: ['eiwit'] },
      ]) });
      meals.push({ id: uid(), slot: 'avond', time: pick(['18:00', '18:30', '19:15', '20:30']), ...pick([
        { text: 'Zalm met broccoli en zilvervliesrijst', tags: ['eiwit', 'omega3', 'groentefruit', 'vezels'] },
        { text: 'Pasta met gehakt en groenten', tags: ['eiwit', 'groentefruit'] },
        { text: 'Bonenschotel met paprika', tags: ['eiwit', 'vezels', 'groentefruit'] },
        { text: 'Pizza', tags: [] },
      ]) });
      if (i % 3 === 0) meals.push({ id: uid(), slot: 'snack', time: '15:30', ...pick([{ text: 'Handje noten', tags: ['eiwit', 'vezels'] }, { text: 'Koek en koffie', tags: ['snelsuiker', 'cafeine'] }, { text: 'Appel', tags: ['groentefruit'] }]) });
      s.meals[d] = meals;
      s.water[d] = 3 + Math.round(Math.random() * 5);
      s.moods[d].focus = Math.max(1, Math.min(10, s.moods[d].energy + (skipBreakfast ? -2 : 0) + Math.round(Math.random() * 2 - 1)));
      if (skipBreakfast) s.moods[d].energy = Math.max(1, s.moods[d].energy - 1);
    }
  });
  s.mealPlan[addDays(today(), 1)] = { ontbijt: 'Kwark met bessen en walnoten', lunch: 'Restje bonenschotel' };
  const t = today();
  delete s.moods[t]; delete s.habitLog[t];
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
  persist();
  notify();
}
