// NEXUS — import uit Apple Gezondheid via een iPhone-opdracht (Shortcuts).
// De opdracht zet tekst op het klembord, één regel per meting:
//   NEXUS-HEALTH
//   SLP|start|eind|fase          slaapfase (Kern, Diep, REM, In bed, Wakker …)
//   STP|datum|waarde             stappen per dag (gegroepeerd per dag)
//   RHR|datum|waarde             rusthartslag per dag
//   HRV|datum|waarde             hartslagvariabiliteit (ms) per dag
//   WRK|start|eind|type|minuten  training
// Datums bij voorkeur als ISO 8601 (2026-10-16T07:30:00+02:00).
import { dateKey } from './store.js';

export const HEADER = 'NEXUS-HEALTH';

/** Getal uit tekst als "8.432", "8,432", "45,2 ms" of "8432". */
export function parseNum(raw) {
  const m = String(raw ?? '').match(/\d[\d.,\s]*/);
  if (!m) return null;
  let s = m[0].trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');      // 8.432,5
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');                  // 8,432.5
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NL_MONTHS = { jan: 0, feb: 1, mrt: 2, maa: 2, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, dec: 11 };

/** Datum uit ISO 8601, of terugval op "16-10-2026 07:30" / "16 okt 2026 om 07:30". */
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3})[a-z.]*\s+(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (m && m[2] in NL_MONTHS) return new Date(+m[3], NL_MONTHS[m[2]], +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  return null;
}

const isInBed = (stage) => /in\s*bed/i.test(stage);
const isAwake = (stage) => /wakker|awake/i.test(stage);

/** Voeg overlappende intervallen samen (Apple Watch + Whoop tellen zo niet dubbel). */
function union(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Slaapuren per ochtend van ontwaken. Dutjes overdag tellen niet mee. */
function sleepPerNight(samples) {
  const asleep = samples.filter((x) => !isInBed(x.stage) && !isAwake(x.stage)).map((x) => [x.start, x.end]);
  const inBed = samples.filter((x) => isInBed(x.stage)).map((x) => [x.start, x.end]);
  const perDay = (blocks) => {
    // Blokken met minder dan 3 uur ertussen horen bij dezelfde nacht.
    const nights = [];
    for (const [a, b] of union(blocks)) {
      const n = nights.at(-1);
      if (n && a - n.end < 3 * 3600e3) { n.ms += b - a; n.end = b; }
      else nights.push({ start: a, end: b, ms: b - a });
    }
    const out = {};
    for (const n of nights) {
      const s = new Date(n.start), e = new Date(n.end);
      const nap = s.getHours() >= 10 && e.getHours() < 20 && dateKey(s) === dateKey(e);
      if (nap) continue;
      const k = dateKey(e);
      out[k] = (out[k] || 0) + n.ms;
    }
    return out;
  };
  const a = perDay(asleep);
  const b = perDay(inBed);
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ms = a[k] || b[k]; // terugval op "in bed" als er geen slaapfases zijn
    if (ms) out[k] = Math.round((ms / 3600e3) * 4) / 4;
  }
  return out;
}

const WORKOUT_MAP = [
  [/run|hardlo|loop/i, 'Hardlopen'], [/cycl|fiets|bik/i, 'Fietsen'], [/walk|wandel|hik/i, 'Wandelen'],
  [/strength|kracht|functional|functione|weight|gewicht/i, 'Kracht'], [/yoga|pilates/i, 'Yoga'],
  [/swim|zwem/i, 'Zwemmen'], [/hiit|interval|cross/i, 'HIIT'],
  [/soccer|voetbal|tennis|padel|basket|hockey|sport|squash|golf|box/i, 'Sport'],
];
const mapWorkout = (t) => (WORKOUT_MAP.find(([re]) => re.test(t)) || [null, 'Overig'])[1];

/**
 * Lees de klembordtekst. Geeft { sleep:{date:hours}, days:{date:{steps,rhr,hrv}}, workouts:[…], count }.
 * Gooit een fout als het geen NEXUS-HEALTH-tekst is.
 */
export function parseHealthText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.some((l) => l.toUpperCase().startsWith(HEADER))) throw new Error('Geen gegevens van de NEXUS-opdracht gevonden');
  const sleepSamples = [];
  const days = {};
  const workouts = [];
  let count = 0;
  const day = (k) => (days[k] ||= {});
  for (const line of lines) {
    const [code, ...f] = line.split('|').map((x) => x.trim());
    switch (code.toUpperCase()) {
      case 'SLP': {
        const s = parseDate(f[0]), e = parseDate(f[1]);
        if (s && e) { sleepSamples.push({ start: +s, end: +e, stage: f[2] || '' }); count++; }
        break;
      }
      case 'STP': case 'RHR': case 'HRV': {
        const d = parseDate(f[0]), v = parseNum(f[1]);
        if (!d || v == null) break;
        const key = { STP: 'steps', RHR: 'rhr', HRV: 'hrv' }[code.toUpperCase()];
        day(dateKey(d))[key] = Math.round(v);
        count++;
        break;
      }
      case 'WRK': {
        const s = parseDate(f[0]), e = parseDate(f[1]);
        if (!s) break;
        let min = parseNum(f[3]);
        if (min == null && e) min = (e - s) / 60000;
        if (!min || min < 1) break;
        workouts.push({ start: +s, date: dateKey(s), type: mapWorkout(f[2] || ''), minutes: Math.round(min) });
        count++;
        break;
      }
      default: break;
    }
  }
  return { sleep: sleepPerNight(sleepSamples), days, workouts, count };
}
