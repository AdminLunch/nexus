// Open Kompas — kleine, pure hulpfuncties. Geen DOM, geen opslag, geen netwerk.

/** Tijd is altijd injecteerbaar (tests, replay). Geeft een ISO-string terug. */
export function nowISO(now) {
  if (now == null) return new Date().toISOString();
  if (now instanceof Date) return now.toISOString();
  return new Date(now).toISOString();
}

export function addDaysISO(iso, days) {
  return new Date(Date.parse(iso) + days * 86400000).toISOString();
}

export function daysSince(fromISO, nowIso) {
  return (Date.parse(nowIso) - Date.parse(fromISO)) / 86400000;
}

let counter = 0;
/** Standaard id-generator; vervangbaar via opties voor deterministische tests. */
export function defaultId(prefix = 'k') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

/** Normaliseer tekst voor vergelijken (kleine letters, geen accenten/leestekens). */
export function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stabiele, korte handtekening van een tekst (om afgewezen hypotheses niet te herhalen). */
export function signature(text) {
  const words = norm(text).split(' ').filter((w) => w.length > 3).sort();
  return [...new Set(words)].join('|');
}

/** Deterministische keuze uit een lijst op basis van een getal (geen Math.random in de kern). */
export function pick(list, n) {
  if (!list.length) return undefined;
  return list[Math.abs(n) % list.length];
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
