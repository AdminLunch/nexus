// NEXUS — persoonlijke inzichten: voeding × stemming/energie/concentratie/slaap.
// Alleen echt geregistreerde gegevens; ontbrekende dagen tellen niet mee.
// Alles hier is samenhang (correlatie), nooit bewijs van oorzaak.
import { getState, lastDays } from '../store.js';
import { MAIN_SLOTS, SLOTS, slotStatus, mainComplete, mainEatenCount, eatenMeals, mealsOn, toMinutes, fromMinutes } from './data.js';

export const MIN_GROUP = 3;   // minimaal aantal dagen per groep voor een vergelijking
export const MIN_CORR = 7;    // minimaal aantal dagen voor een samenhangsmaat

export const METRICS = {
  energy: { l: 'Energie', max: 10 },
  focus: { l: 'Concentratie', max: 10 },
  mood: { l: 'Stemming', max: 5 },
};
export const metricOn = (d, k) => { const v = getState().moods[d]?.[k]; return Number.isFinite(v) ? v : null; };

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
export const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  if (!dx || !dy) return null; // geen variatie → niets te zeggen
  return num / Math.sqrt(dx * dy);
}

export function strength(r) {
  if (r == null) return { l: 'geen variatie', c: '' };
  const a = Math.abs(r);
  if (a < 0.1) return { l: 'geen samenhang', c: '' };
  if (a < 0.3) return { l: `zwak ${r > 0 ? 'positief' : 'negatief'}`, c: '' };
  if (a < 0.5) return { l: `matig ${r > 0 ? 'positief' : 'negatief'}`, c: r > 0 ? 'g' : 'a' };
  return { l: `sterk ${r > 0 ? 'positief' : 'negatief'}`, c: r > 0 ? 'g' : 'a' };
}

/** Vergelijk een maat tussen twee groepen dagen. */
function compare(days, metric, groupOf) {
  const a = [], b = [];
  for (const d of days) {
    const g = groupOf(d);
    const v = metricOn(d, metric);
    if (g == null || v == null) continue;
    (g ? a : b).push(v);
  }
  const enough = a.length >= MIN_GROUP && b.length >= MIN_GROUP;
  return { yes: { mean: round1(mean(a)), n: a.length }, no: { mean: round1(mean(b)), n: b.length }, diff: enough ? round1(mean(a) - mean(b)) : null, enough };
}

/** Ontbijt gegeten (true) / overgeslagen (false) / onbekend (null). */
const breakfastOf = (d) => { const s = slotStatus(d, 'ontbijt'); return s === 'eaten' ? true : s === 'skipped' ? false : null; };
/** Regelmatig = alle drie hoofdmaaltijden gegeten; alleen dagen waarop alle drie zijn ingevuld. */
const regularOf = (d) => (mainComplete(d) ? mainEatenCount(d) === 3 : null);

export function breakfastVs(days, metric) { return compare(days, metric, breakfastOf); }
export function regularityVs(days, metric) { return compare(days, metric, regularOf); }

/** Per eetmoment: gegeten / overgeslagen / niet ingevuld. */
export function slotStats(days) {
  return MAIN_SLOTS.map((s) => {
    const c = { eaten: 0, skipped: 0, empty: 0 };
    days.forEach((d) => c[slotStatus(d, s.id)]++);
    const known = c.eaten + c.skipped;
    return { ...s, ...c, known, skipRate: known ? c.skipped / known : null };
  });
}

/** Factoren (per dag een getal of null) om tegen een maat af te zetten. */
export const FACTORS = [
  { id: 'ontbijt', l: 'Ontbijt gegeten', get: (d) => { const b = breakfastOf(d); return b == null ? null : b ? 1 : 0; } },
  { id: 'eiwitontbijt', l: 'Eiwit bij ontbijt', get: (d) => (slotStatus(d, 'ontbijt') === 'eaten' ? (eatenMeals(d).some((m) => m.slot === 'ontbijt' && (m.tags || []).includes('eiwit')) ? 1 : 0) : breakfastOf(d) === false ? 0 : null) },
  { id: 'hoofdmaaltijden', l: 'Aantal hoofdmaaltijden', get: (d) => (mainComplete(d) ? mainEatenCount(d) : null) },
  { id: 'snelsuiker', l: 'Snelle suikers (aantal)', get: (d) => (mealsOn(d).length ? eatenMeals(d).filter((m) => (m.tags || []).includes('snelsuiker')).length : null) },
  { id: 'water', l: 'Water (glazen)', get: (d) => getState().water[d] ?? null },
  { id: 'slaap', l: 'Slaap (uren)', get: (d) => getState().sleep[d]?.hours ?? null },
];

export function correlations(days, metric) {
  return FACTORS.map((f) => {
    const xs = [], ys = [];
    days.forEach((d) => {
      const x = f.get(d), y = metricOn(d, metric);
      if (x != null && y != null) { xs.push(x); ys.push(y); }
    });
    const r = xs.length >= MIN_CORR ? pearson(xs, ys) : null;
    return { ...f, n: xs.length, r: r == null ? null : Math.round(r * 100) / 100, enough: xs.length >= MIN_CORR };
  });
}

/** Eetritme: tijd van eerste/laatste maaltijd en spreiding. */
export function rhythm(days) {
  const first = [], last = [];
  days.forEach((d) => {
    const times = eatenMeals(d).map((m) => toMinutes(m.time)).filter((x) => x != null).sort((a, b) => a - b);
    if (!times.length) return;
    first.push(times[0]);
    if (times.length > 1) last.push(times.at(-1));
  });
  return {
    n: first.length,
    first: first.length ? fromMinutes(mean(first)) : null,
    firstSpread: sd(first) != null ? Math.round(sd(first)) : null,
    last: last.length ? fromMinutes(mean(last)) : null,
    lastSpread: sd(last) != null ? Math.round(sd(last)) : null,
  };
}

/** Alle inzichten in één object (UI en AI). */
export function allInsights(nDays = 30) {
  const days = lastDays(nDays);
  const stats = slotStats(days);
  const mostSkipped = stats.filter((s) => s.known >= MIN_GROUP && s.skipped > 0).sort((a, b) => b.skipRate - a.skipRate)[0] || null;
  return {
    days: nDays,
    loggedDays: days.filter((d) => mealsOn(d).length).length,
    slots: stats,
    mostSkipped,
    breakfastEnergy: breakfastVs(days, 'energy'),
    breakfastFocus: breakfastVs(days, 'focus'),
    regularityMood: regularityVs(days, 'mood'),
    regularityEnergy: regularityVs(days, 'energy'),
    rhythm: rhythm(days),
    focusCorr: correlations(days, 'focus'),
    energyCorr: correlations(days, 'energy'),
  };
}

export { SLOTS };
