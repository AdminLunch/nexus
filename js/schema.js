// NEXUS — typecontrole van opgeslagen gegevens.
//
// Elke staat (uit localStorage of uit een back-upbestand) gaat hier doorheen voordat de app
// hem gebruikt. Geldige gegevens blijven exact gelijk; alleen waarden van het verkeerde type
// worden omgezet naar een veilig type. Zo kan een gemanipuleerd back-upbestand geen HTML of
// script in de schermen krijgen (getallen, id's en keuzelijsten worden vaak zonder esc() getoond).
// Onbekende velden blijven ongemoeid bewaard (vooruit-compatibel).

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const str = (v, def = '') => (typeof v === 'string' ? v : v == null ? def : String(v));
const bool = (v) => v === true;
/** Getal of standaardwaarde; numerieke tekst ("7") wordt een getal. */
function num(v, def = 0) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.replace(',', '.')); if (Number.isFinite(n)) return n; }
  return def;
}
const clampInt = (v, lo, hi, def) => Math.max(lo, Math.min(hi, Math.round(num(v, def))));

/** Ongeldige id's (bijv. met aanhalingstekens of tags) krijgen een vaste, veilige vervanger. */
export function safeId(v) {
  const s = str(v);
  if (ID_RE.test(s)) return s;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `x${(h >>> 0).toString(36)}`;
}

/** Object met datum-sleutels → per sleutel fn(waarde); waarden waar fn undefined geeft, vervallen. */
function byDate(obj, fn) {
  const out = {};
  if (!isObj(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const r = fn(v);
    if (r !== undefined) out[k] = r;
  }
  return out;
}
const list = (arr, fn) => (Array.isArray(arr) ? arr.filter(isObj).map(fn) : []);

const MEAL_SLOT_IDS = ['ontbijt', 'lunch', 'diner', 'snack'];

const fixPriority = (p) => ({ ...p, id: safeId(p.id), text: str(p.text), done: bool(p.done) });
const fixMilestone = (m) => ({ ...m, id: safeId(m.id), text: str(m.text), done: bool(m.done) });

/**
 * Maak een staat type-veilig. `base` levert de standaardwaarden (defaults()).
 * Muteert niets; geeft een nieuw object terug.
 */
export function normalizeState(s, base) {
  const out = { ...s };
  const set = { ...base.settings, ...(isObj(s.settings) ? s.settings : {}) };
  for (const k of ['sleepTarget', 'weeklyTrainingTarget', 'kcalTarget', 'proteinTarget', 'waterTarget']) set[k] = num(set[k], base.settings[k]);
  for (const k of ['name', 'aiProvider', 'aiEndpoint', 'aiModel', 'aiKey']) set[k] = str(set[k], base.settings[k]);
  out.settings = set;

  out.priorities = byDate(s.priorities, (v) => list(v, fixPriority));
  out.moods = byDate(s.moods, (v) => (isObj(v) ? { ...v, mood: clampInt(v.mood, 1, 5, 3), energy: clampInt(v.energy, 0, 10, 5) } : undefined));
  out.reflections = byDate(s.reflections, (v) => (v == null ? undefined : str(v)));
  out.habits = Array.isArray(s.habits) ? list(s.habits, (h) => ({ ...h, id: safeId(h.id), name: str(h.name), icon: str(h.icon) })) : base.habits;
  out.habitLog = byDate(s.habitLog, (v) => (Array.isArray(v) ? v.map(safeId) : undefined));
  out.sleep = byDate(s.sleep, (v) => (isObj(v) ? { ...v, hours: num(v.hours), quality: clampInt(v.quality, 1, 5, 3) } : undefined));
  out.workouts = list(s.workouts, (w) => {
    const r = { ...w, id: safeId(w.id), date: str(w.date), type: str(w.type, 'Overig'), minutes: num(w.minutes), intensity: clampInt(w.intensity, 1, 5, 3) };
    if (w.start != null) r.start = num(w.start);
    if (w.source != null) r.source = str(w.source);
    return r;
  });
  out.health = byDate(s.health, (v) => {
    if (!isObj(v)) return undefined;
    const r = { ...v };
    for (const k of ['steps', 'rhr', 'hrv']) { if (k in r) { const n = num(r[k], NaN); if (Number.isFinite(n)) r[k] = n; else delete r[k]; } }
    return r;
  });
  out.healthImportedAt = s.healthImportedAt == null ? null : str(s.healthImportedAt);
  out.meals = byDate(s.meals, (v) => list(v, (m) => ({
    ...m, id: safeId(m.id), name: str(m.name), slot: MEAL_SLOT_IDS.includes(m.slot) ? m.slot : 'snack',
    kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat),
  })));
  out.water = byDate(s.water, (v) => { const n = num(v, NaN); return Number.isFinite(n) ? n : undefined; });
  out.goals = list(s.goals, (g) => ({
    ...g, id: safeId(g.id), title: str(g.title), why: str(g.why), category: str(g.category, 'Persoonlijk'),
    deadline: str(g.deadline), createdAt: str(g.createdAt), milestones: list(g.milestones, fixMilestone),
  }));
  out.chat = list(s.chat, (m) => ({ ...m, role: m.role === 'user' ? 'user' : 'bot', text: str(m.text), t: num(m.t) }));
  return out;
}
