// NEXUS — voeding: eetmomenten, bouwstenen, voedingsbibliotheek en afgeleide gegevens.
// Basis is ritme en bouwstenen, zonder te moeten tellen. Calorieën en macro's zijn een optionele
// extra laag (instelling 'kcal en macro's bijhouden'); ze blijven bij bewerken altijd behouden.
// Eén maaltijd-record: {id, slot, name, time, tags, kcal?, protein?, carbs?, fat?} of {id, slot, skipped, time}.
import { getState, update, today, lastDays, uid, changeWater } from '../store.js';

export const SLOTS = [
  { id: 'ontbijt', l: 'Ontbijt', e: '🌅', main: true, hint: 'Ochtend' },
  { id: 'lunch', l: 'Lunch', e: '☀️', main: true, hint: 'Middag' },
  { id: 'diner', l: 'Avondeten', e: '🌙', main: true, hint: 'Avond' },
  { id: 'snack', l: 'Tussendoor', e: '🍎', main: false, hint: 'Wanneer je wilt' },
];
export const MAIN_SLOTS = SLOTS.filter((s) => s.main);
export const slotById = (id) => SLOTS.find((s) => s.id === id) || SLOTS[3];

/** Bouwstenen. 'snelsuiker' en 'cafeine' zijn neutraal bedoeld: om patronen te zien, niet om te oordelen. */
export const TAGS = [
  { id: 'eiwit', l: 'Eiwit', e: '🥚' },
  { id: 'vezels', l: 'Vezels', e: '🌾' },
  { id: 'omega3', l: 'Omega 3', e: '🐟' },
  { id: 'groentefruit', l: 'Groente/fruit', e: '🥦' },
  { id: 'gefermenteerd', l: 'Gefermenteerd', e: '🫙' },
  { id: 'snelsuiker', l: 'Snelle suikers', e: '🍬' },
  { id: 'cafeine', l: 'Cafeïne', e: '☕' },
];
export const BUILDING_BLOCKS = ['eiwit', 'vezels', 'omega3', 'groentefruit', 'gefermenteerd'];
export const tagById = (id) => TAGS.find((t) => t.id === id);

/**
 * Voedingsbibliotheek voor snel registreren. `k` = zoekwoorden voor automatische herkenning
 * in vrije tekst. `pe`/`ve` = relatief veel eiwit/vezels (voor de AI en het kennisoverzicht).
 */
export const FOODS = [
  { id: 'havermout', l: 'Havermout', e: '🥣', tags: ['vezels'], ve: 1, k: ['havermout', 'haver', 'oats', 'overnight'], note: 'Vezels (bèta-glucaan) en langzame koolhydraten; geeft een geleidelijke bloedsuikerstijging.' },
  { id: 'groenebanaan', l: 'Groene banaan', e: '🍌', tags: ['vezels', 'groentefruit'], k: ['groene banaan'], note: 'Onrijpe banaan bevat resistent zetmeel: voeding voor darmbacteriën (prebioticum).' },
  { id: 'banaan', l: 'Banaan', e: '🍌', tags: ['groentefruit'], k: ['banaan'], note: 'Fruit; rijper = zoeter en sneller opneembaar.' },
  { id: 'kefir', l: 'Kefir', e: '🥛', tags: ['gefermenteerd', 'eiwit'], k: ['kefir'], note: 'Gefermenteerde melkdrank met levende culturen en eiwit.' },
  { id: 'yoghurt', l: 'Yoghurt', e: '🥛', tags: ['gefermenteerd', 'eiwit'], k: ['yoghurt', 'yogurt', 'skyr'], note: 'Eiwit; naturel bevat levende culturen.' },
  { id: 'kwark', l: 'Kwark', e: '🥄', tags: ['eiwit'], pe: 1, k: ['kwark', 'cottage', 'hüttenkäse'], note: 'Veel eiwit per portie.' },
  { id: 'eieren', l: 'Eieren', e: '🥚', tags: ['eiwit'], pe: 1, k: ['ei ', 'eieren', 'eitje', 'omelet', 'roerei', 'gekookt ei', 'spiegelei'], note: 'Eiwit (alle essentiële aminozuren) en choline.' },
  { id: 'vettevis', l: 'Vette vis', e: '🐟', tags: ['eiwit', 'omega3'], pe: 1, k: ['zalm', 'makreel', 'haring', 'sardine', 'forel', 'ansjovis', 'vette vis', 'paling'], note: 'Belangrijkste bron van de omega 3-vetzuren EPA en DHA, plus eiwit.' },
  { id: 'walnoten', l: 'Walnoten', e: '🌰', tags: ['omega3', 'vezels'], k: ['walnoot', 'walnoten'], note: 'Plantaardige omega 3 (ALA), vezels en gezonde vetten.' },
  { id: 'zaden', l: 'Lijnzaad/chia', e: '🌱', tags: ['omega3', 'vezels'], ve: 1, k: ['lijnzaad', 'chia', 'hennepzaad'], note: 'Plantaardige omega 3 (ALA) en veel vezels.' },
  { id: 'noten', l: 'Noten/pinda', e: '🥜', tags: ['eiwit', 'vezels'], k: ['noten', 'pinda', 'amandel', 'cashew', 'pindakaas', 'notenpasta'], note: 'Eiwit, vezels, magnesium en onverzadigde vetten.' },
  { id: 'bessen', l: 'Bessen', e: '🫐', tags: ['groentefruit', 'vezels'], k: ['bessen', 'blauwe bes', 'bosbes', 'framboos', 'frambozen', 'aardbei', 'braam'], note: 'Vezels en polyfenolen (antioxidanten).' },
  { id: 'granaatappel', l: 'Granaatappel', e: '🍎', tags: ['groentefruit'], k: ['granaatappel'], note: 'Rijk aan polyfenolen.' },
  { id: 'peulvruchten', l: 'Peulvruchten', e: '🫘', tags: ['eiwit', 'vezels'], pe: 1, ve: 1, k: ['bonen', 'linzen', 'kikkererwt', 'hummus', 'erwten', 'edamame'], note: 'Eiwit én veel vezels; langzame koolhydraten.' },
  { id: 'volkoren', l: 'Volkoren', e: '🍞', tags: ['vezels'], ve: 1, k: ['volkoren', 'roggebrood', 'zilvervlies', 'quinoa', 'boekweit'], note: 'Vezels en langzame koolhydraten.' },
  { id: 'groenten', l: 'Groenten', e: '🥦', tags: ['groentefruit', 'vezels'], k: ['groente', 'salade', 'broccoli', 'spinazie', 'paprika', 'wortel', 'tomaat', 'komkommer', ' sla ', 'boerenkool', 'courgette', 'bloemkool', 'spruitjes', 'sperziebonen'], note: 'Vezels, vitamines en mineralen.' },
  { id: 'fruit', l: 'Fruit', e: '🍏', tags: ['groentefruit'], k: ['fruit', 'appel', 'peer', 'sinaasappel', 'kiwi', 'mandarijn', 'druiven', 'mango'], note: 'Vezels en vitamines.' },
  { id: 'kip', l: 'Kip/vlees', e: '🍗', tags: ['eiwit'], pe: 1, k: ['kip', 'kalkoen', 'vlees', 'rund', 'gehakt', 'biefstuk', 'varken', ' ham ', 'hamburger'], note: 'Eiwit, ijzer (vooral rood vlees) en vitamine B12.' },
  { id: 'tofu', l: 'Tofu/tempeh', e: '🧈', tags: ['eiwit'], pe: 1, k: ['tofu', 'tempeh', 'seitan'], note: 'Plantaardig eiwit; tempeh is gefermenteerd.' },
  { id: 'zuurkool', l: 'Zuurkool/kimchi', e: '🥬', tags: ['gefermenteerd', 'groentefruit'], k: ['zuurkool', 'kimchi', 'kombucha', 'miso'], note: 'Gefermenteerd (rauw/ongepasteuriseerd bevat levende culturen).' },
  { id: 'koudzetmeel', l: 'Afgekoelde aardappel/rijst', e: '🥔', tags: ['vezels'], k: ['koude aardappel', 'afgekoeld', 'koude rijst', 'aardappelsalade'], note: 'Afkoelen na koken vormt resistent zetmeel.' },
  { id: 'koffie', l: 'Koffie', e: '☕', tags: ['cafeine'], k: ['koffie', 'espresso', 'cappuccino', 'energiedrank', ' cola', 'zwarte thee', 'groene thee', 'matcha'], note: 'Cafeïne; houdt uren aan — kan slaap beïnvloeden.' },
  { id: 'zoet', l: 'Zoet/snoep', e: '🍬', tags: ['snelsuiker'], k: ['snoep', 'koek', 'chocola', 'frisdrank', 'taart', 'gebak', ' ijs', 'ijsje', 'croissant', 'donut', 'limonade'], note: 'Snelle suikers: snelle piek in bloedsuiker.' },
];

/** Herken bouwstenen in vrije tekst. */
export function detectTags(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z\u00e0-\u00ff0-9]+/g, ' ')} `;
  const out = new Set();
  for (const f of FOODS) {
    if (f.k.some((k) => t.includes(k))) f.tags.forEach((x) => out.add(x));
  }
  // 'groene banaan' mag niet óók als gewone banaan tellen: geen probleem, tags overlappen.
  return [...out];
}

// ---------- lezen ----------
export const mealsOn = (d) => getState().meals[d] || [];
export const eatenMeals = (d) => mealsOn(d).filter((m) => !m.skipped);

/** 'eaten' | 'skipped' | 'empty' */
export function slotStatus(d, slotId) {
  const list = mealsOn(d).filter((m) => m.slot === slotId);
  if (list.some((m) => !m.skipped)) return 'eaten';
  if (list.some((m) => m.skipped)) return 'skipped';
  return 'empty';
}
export const mainEatenCount = (d) => MAIN_SLOTS.filter((s) => slotStatus(d, s.id) === 'eaten').length;
/** Alle drie hoofdmaaltijden hebben een status (gegeten of overgeslagen). */
export const mainComplete = (d) => MAIN_SLOTS.every((s) => slotStatus(d, s.id) !== 'empty');
export const hasNutritionData = (d) => mealsOn(d).length > 0 || (getState().water[d] || 0) > 0;

export function tagCounts(d) {
  const out = Object.fromEntries(TAGS.map((t) => [t.id, 0]));
  eatenMeals(d).forEach((m) => (m.tags || []).forEach((t) => { if (t in out) out[t]++; }));
  return out;
}
export const waterOn = (d) => getState().water[d] || 0;
export const planFor = (d) => getState().mealPlan[d] || {};

/** Recente, unieke maaltijden (voor één-tik herhalen). */
export function recentMeals(limit = 8) {
  const seen = new Set();
  const out = [];
  const days = lastDays(45).reverse();
  for (const d of days) {
    for (const m of [...mealsOn(d)].reverse()) {
      if (m.skipped || !m.name) continue;
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const toMinutes = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
export const fromMinutes = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;

/** Standaard-eetmoment op basis van het tijdstip. */
export function slotForTime(hhmm = nowTime()) {
  const m = toMinutes(hhmm);
  if (m < 10 * 60 + 30) return 'ontbijt';
  if (m >= 11 * 60 + 30 && m < 14 * 60 + 30) return 'lunch';
  if (m >= 17 * 60 && m < 21 * 60) return 'diner';
  return 'snack';
}

// ---------- schrijven ----------
/** Maaltijd toevoegen of bijwerken. Een "overgeslagen"-markering voor dat moment vervalt. */
export function saveMeal(d, meal) {
  update((st) => {
    const list = (st.meals[d] ||= []);
    const i = meal.id ? list.findIndex((m) => m.id === meal.id) : -1;
    const prev = i >= 0 ? list[i] : {};
    const n = (v, d) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : d; };
    const clean = {
      ...prev, // onbekende of optionele velden (zoals kcal) gaan bij bewerken niet verloren
      id: meal.id || uid(),
      slot: meal.slot,
      time: meal.time || nowTime(),
      name: String(meal.name || '').trim().slice(0, 140),
      tags: [...new Set(meal.tags || [])].filter((t) => tagById(t)),
    };
    delete clean.skipped;
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) clean[k] = n(meal[k], Number(prev[k]) || 0);
    clean.kcal = Math.round(clean.kcal);
    if (i >= 0) list[i] = clean; else list.push(clean);
    st.meals[d] = list.filter((m) => !(m.skipped && m.slot === clean.slot));
  });
}
export function skipSlot(d, slotId) {
  update((st) => {
    const list = (st.meals[d] ||= []);
    if (list.some((m) => m.slot === slotId)) return;
    list.push({ id: uid(), slot: slotId, skipped: true, time: nowTime() });
  });
}
export function deleteMeal(d, id) {
  update((st) => {
    st.meals[d] = (st.meals[d] || []).filter((m) => m.id !== id);
    if (!st.meals[d].length) delete st.meals[d];
  });
}
/** Water op een absoluut aantal zetten (via changeWater, zodat de gewoonte 'Water drinken' meeloopt). */
export function setWater(d, n) {
  const v = Math.max(0, Math.min(30, Math.round(Number(n) || 0)));
  changeWater(d, v - (getState().water[d] || 0));
}
export function setPlan(d, slotId, text) {
  update((st) => {
    const p = (st.mealPlan[d] ||= {});
    const v = String(text || '').trim().slice(0, 120);
    if (v) p[slotId] = v; else delete p[slotId];
    if (!Object.keys(p).length) delete st.mealPlan[d];
  });
}

/** Week-/periodesamenvatting, gedeeld door UI en AI. */
export function periodSummary(days) {
  const s = getState();
  const logged = days.filter((d) => mealsOn(d).length);
  const perSlot = Object.fromEntries(SLOTS.map((sl) => [sl.id, { eaten: 0, skipped: 0, empty: 0 }]));
  days.forEach((d) => SLOTS.forEach((sl) => {
    if (sl.id === 'snack') { perSlot.snack[eatenMeals(d).some((m) => m.slot === 'snack') ? 'eaten' : 'empty']++; return; }
    perSlot[sl.id][slotStatus(d, sl.id)]++;
  }));
  const tags = Object.fromEntries(TAGS.map((t) => [t.id, 0]));
  days.forEach((d) => { const c = tagCounts(d); for (const k in c) tags[k] += c[k]; });
  const waterDays = days.filter((d) => s.water[d]);
  return {
    days: days.length,
    loggedDays: logged.length,
    perSlot,
    tags,
    avgWater: waterDays.length ? Math.round((waterDays.reduce((a, d) => a + s.water[d], 0) / waterDays.length) * 10) / 10 : null,
    waterDays: waterDays.length,
    meals: days.flatMap((d) => eatenMeals(d).map((m) => ({ date: d, slot: m.slot, time: m.time, name: m.name, tags: m.tags }))),
  };
}

export const todayKey = today;
