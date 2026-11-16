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
const THOUGHT_KINDS = ['idee', 'zorg', 'piekeren', 'dankbaar', 'taak', 'overig'];
const TAG_RE = /^[a-z0-9]{1,20}$/;
/** "HH:MM" of leeg. */
const safeTime = (v) => { const t = str(v); return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : ''; };

const fixPriority = (p) => ({ ...p, id: safeId(p.id), text: str(p.text), done: bool(p.done) });
const fixMilestone = (m) => ({ ...m, id: safeId(m.id), text: str(m.text), done: bool(m.done) });

const K_TYPES = ['told', 'value', 'interest', 'possible', 'insight'];
const K_STATUS = ['active', 'outdated', 'corrected', 'deleted'];
const optStr = (v) => (v == null ? null : str(v));

/**
 * Open Kompas-geheugen veilig maken. Geldige gegevens blijven gelijk. Een "inzicht" zonder
 * bevestiging door de gebruiker wordt nooit als feit behandeld: het wordt een onbevestigd verband.
 */
function fixKompas(k, base) {
  if (!isObj(k) || !Array.isArray(k.entries)) return base;
  const seen = new Set();
  const entries = [];
  for (const e of k.entries) {
    if (!isObj(e) || !K_TYPES.includes(e.type) || !K_STATUS.includes(e.status)) continue;
    const id = safeId(e.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (e.status === 'deleted') { entries.push({ id, type: e.type, origin: e.origin === 'nexus' ? 'nexus' : 'user', status: 'deleted', createdAt: str(e.createdAt), updatedAt: str(e.updatedAt), deletedAt: str(e.deletedAt) }); continue; }
    const text = str(e.text).slice(0, 500);
    if (!text.trim()) continue;
    const r = { ...e, id, text, origin: e.origin === 'nexus' ? 'nexus' : 'user', topics: Array.isArray(e.topics) ? e.topics.map((t) => str(t)).slice(0, 8) : [],
      createdAt: str(e.createdAt), updatedAt: str(e.updatedAt), lastConfirmedAt: optStr(e.lastConfirmedAt), reviewAfter: optStr(e.reviewAfter),
      history: Array.isArray(e.history) ? e.history.filter(isObj).slice(-50).map((h) => ({ ...h, at: str(h.at), action: str(h.action), by: h.by === 'user' ? 'user' : 'nexus' })) : [] };
    if (r.type === 'insight' && !r.lastConfirmedAt) { r.type = 'possible'; r.origin = 'nexus'; }
    if (r.type === 'possible') {
      r.origin = 'nexus';
      r.alternatives = Array.isArray(e.alternatives) ? e.alternatives.map((a) => str(a)).filter(Boolean).slice(0, 4) : [];
      if (!r.alternatives.length) r.alternatives = ['Het kan ook heel anders zitten — jij weet dat het beste.'];
      if (e.expiresAt != null) r.expiresAt = str(e.expiresAt);
      if (e.evidence != null) r.evidence = Array.isArray(e.evidence) ? e.evidence.map((x) => num(x)).slice(0, 10) : [];
    }
    entries.push(r);
  }
  const suppressed = Array.isArray(k.suppressed) ? k.suppressed.filter(isObj).map((x) => ({ sig: str(x.sig), until: str(x.until), reason: str(x.reason) })).filter((x) => x.sig) : [];
  const out = { ...k, schema: 1, createdAt: str(k.createdAt), entries, suppressed };
  if (k.sessions != null) out.sessions = num(k.sessions);
  return out;
}

/**
 * Maak een staat type-veilig. `base` levert de standaardwaarden (defaults()).
 * Muteert niets; geeft een nieuw object terug.
 */
export function normalizeState(s, base) {
  const out = { ...s };
  const set = { ...base.settings, ...(isObj(s.settings) ? s.settings : {}) };
  for (const k of ['sleepTarget', 'weeklyTrainingTarget', 'kcalTarget', 'proteinTarget', 'waterTarget']) set[k] = num(set[k], base.settings[k]);
  for (const k of ['name', 'aiProvider', 'aiEndpoint', 'aiModel', 'aiKey']) set[k] = str(set[k], base.settings[k]);
  for (const k of ['trackKcal', 'cloudSync']) set[k] = bool(set[k]);
  out.settings = set;

  out.priorities = byDate(s.priorities, (v) => list(v, fixPriority));
  // Elk veld is optioneel: wat niet is ingevuld, wordt niet verzonnen.
  out.moods = byDate(s.moods, (v) => {
    if (!isObj(v)) return undefined;
    const r = { ...v };
    if (v.mood != null) r.mood = clampInt(v.mood, 1, 5, 3); else delete r.mood;
    for (const k of ['energy', 'focus']) { if (v[k] != null) r[k] = clampInt(v[k], 0, 10, 5); else delete r[k]; }
    return r;
  });
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
  out.meals = byDate(s.meals, (v) => list(v, (m) => {
    const slot = m.slot === 'avond' ? 'diner' : MEAL_SLOT_IDS.includes(m.slot) ? m.slot : 'snack';
    if (m.skipped === true) {
      const r = { id: safeId(m.id), slot, skipped: true };
      if (m.time != null) r.time = safeTime(m.time);
      return r;
    }
    const r = { ...m, id: safeId(m.id), name: str(m.name), slot, kcal: num(m.kcal), protein: num(m.protein), carbs: num(m.carbs), fat: num(m.fat) };
    delete r.skipped;
    if (m.time != null) r.time = safeTime(m.time);
    if (m.tags != null) r.tags = Array.isArray(m.tags) ? [...new Set(m.tags.map(str).filter((t) => TAG_RE.test(t)))] : [];
    return r;
  }));
  out.mealPlan = byDate(s.mealPlan, (v) => {
    if (!isObj(v)) return undefined;
    const r = {};
    for (const [k, t] of Object.entries(v)) { const slot = k === 'avond' ? 'diner' : k; if (MEAL_SLOT_IDS.includes(slot) && t != null && str(t)) r[slot] = str(t).slice(0, 120); }
    return Object.keys(r).length ? r : undefined;
  });
  out.thoughts = list(s.thoughts, (x) => ({
    ...x, id: safeId(x.id), date: str(x.date), t: num(x.t), kind: THOUGHT_KINDS.includes(x.kind) ? x.kind : 'overig', text: str(x.text).slice(0, 500),
  }));
  out.updatedAt = num(s.updatedAt);
  out.kompas = fixKompas(s.kompas, base.kompas);
  out.water = byDate(s.water, (v) => { const n = num(v, NaN); return Number.isFinite(n) ? n : undefined; });
  out.goals = list(s.goals, (g) => ({
    ...g, id: safeId(g.id), title: str(g.title), why: str(g.why), category: str(g.category, 'Persoonlijk'),
    deadline: str(g.deadline), createdAt: str(g.createdAt), milestones: list(g.milestones, fixMilestone),
  }));
  out.chat = list(s.chat, (m) => ({ ...m, role: m.role === 'user' ? 'user' : 'bot', text: str(m.text), t: num(m.t) }));

  // Toestemming: alleen echte true telt; ontbreekt het blok, dan geldt "niets delen".
  const pv = isObj(s.privacy) ? s.privacy : {};
  const ai = isObj(pv.ai) ? pv.ai : {};
  const scopes = {};
  if (isObj(ai.scopes)) for (const [k, v] of Object.entries(ai.scopes)) if (ID_RE.test(k)) scopes[k] = v === true;
  out.privacy = {
    ...pv,
    ai: {
      ...ai,
      textVersion: ai.textVersion == null ? null : str(ai.textVersion),
      host: str(ai.host),
      scopes,
      decidedAt: ai.decidedAt == null ? null : str(ai.decidedAt),
      updatedAt: ai.updatedAt == null ? null : str(ai.updatedAt),
    },
    aiLog: list(pv.aiLog, (e) => ({ t: str(e.t), host: str(e.host), categories: Array.isArray(e.categories) ? e.categories.map((c) => str(c)) : [], historyCount: num(e.historyCount) })).slice(0, 200),
  };
  return out;
}
