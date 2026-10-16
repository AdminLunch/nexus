// NEXUS — UI-hulpjes en grafieken (pure SVG, geen externe libraries).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const MOODS = [
  { e: '😞', l: 'Zwaar' },
  { e: '😕', l: 'Matig' },
  { e: '😐', l: 'Oké' },
  { e: '🙂', l: 'Goed' },
  { e: '🤩', l: 'Top' },
];

export const DAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
export const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return DAYS_SHORT[new Date(y, m - 1, d).getDay()];
}
export function prettyDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function shortDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export const icons = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
};

let gradCount = 0;
const gid = (p) => `${p}${++gradCount}`;

function gradientDefs(id) {
  return `<defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#38e8ff"/><stop offset=".5" stop-color="#4d7cff"/><stop offset="1" stop-color="#a35bff"/>
    </linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4d7cff" stop-opacity=".35"/><stop offset="1" stop-color="#a35bff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
}

/** Voortgangsring. pct 0-100. */
const prevRing = {};
const prevBar = {};
const prevCount = {};
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ring(pct, { size = 112, stroke = 10, label = '', sub = '', key = null, pulse = false } = {}) {
  const id = gid('rg');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="ring-wrap${pulse ? ' pulse' : ''}" style="width:${size}px;height:${size}px"${key ? ` data-ring="${key}"` : ''}>
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      ${gradientDefs(id)}
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="ring-bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="url(#${id})"
        stroke-dasharray="${c}" stroke-dashoffset="${key && prevRing[key] != null ? prevRing[key] : c}" data-target="${off}" ${key ? `data-key="${key}"` : ''}/>
    </svg>
    <div class="ring-label"><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
  </div>`;
}
/** Start ring-animaties na plaatsing in de DOM. */
export function animateRings(root) {
  root.querySelectorAll('.bar > i[data-w]').forEach((el) => {
    const k = el.dataset.key;
    if (k && prevBar[k] != null) el.style.width = prevBar[k] + '%';
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('.ring-bar[data-target]').forEach((el) => {
      el.style.strokeDashoffset = el.dataset.target;
      if (el.dataset.key) prevRing[el.dataset.key] = el.dataset.target;
    });
    root.querySelectorAll('.bar > i[data-w]').forEach((el) => {
      el.style.width = el.dataset.w + '%';
      if (el.dataset.key) prevBar[el.dataset.key] = el.dataset.w;
    });
  }));
  root.querySelectorAll('.ring-wrap[data-ring]').forEach(countUp);
}

/** Laat het getal in een ring meetellen naar de nieuwe waarde ("78" of "45%"). */
function countUp(wrap) {
  const key = wrap.dataset.ring;
  const b = wrap.querySelector('.ring-label b');
  const m = b && b.textContent.trim().match(/^(\d+)(%?)$/);
  if (!m) { delete prevCount[key]; return; }
  const to = Number(m[1]);
  const seen = key in prevCount;
  const from = seen ? prevCount[key] : 0;
  prevCount[key] = to;
  if (from === to) return;
  if (seen) wrap.classList.add('bump'); // opleving alleen bij een echte wijziging, niet bij eerste keer
  if (reducedMotion()) return;
  const suffix = m[2];
  const dur = 1100;
  const t0 = performance.now();
  const step = (now) => {
    if (!b.isConnected) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    b.textContent = Math.round(from + (to - from) * e) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  b.textContent = from + suffix;
  requestAnimationFrame(step);
  // Vangnet: zonder animatieframes (app op de achtergrond) toch de juiste eindwaarde tonen.
  setTimeout(() => { if (b.isConnected) b.textContent = to + suffix; }, dur + 150);
}

// ---------- ripple bij aanraken ----------
const RIPPLE = '.btn, .chip, .habit, .check-item, button.tile, .scale button, .stepper button, .icon-btn';
export function initRipples() {
  if (reducedMotion()) return;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(RIPPLE);
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `--rs:${size}px;--rx:${e.clientX - r.left}px;--ry:${e.clientY - r.top}px`;
    s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
    setTimeout(() => s.remove(), 900); // vangnet
  }, { passive: true });
}

/**
 * Lijngrafiek. values: getal of null per punt.
 */
export function lineChart(values, { labels = [], min = 0, max = null, height = 150, target = null, unit = '', smooth = true } = {}) {
  const id = gid('lc');
  const W = 340, H = height, padL = 26, padR = 8, padT = 12, padB = 22;
  const nums = values.filter((v) => v != null);
  if (!nums.length) return `<div class="empty">Nog geen gegevens — log je eerste waarde.</div>`;
  const hi = max ?? Math.max(...nums, target ?? 0) * 1.1;
  const lo = min;
  const n = values.length;
  const x = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)]));

  // pad bouwen over aaneengesloten segmenten
  let d = '';
  let segStart = true;
  let prev = null;
  pts.forEach((p) => {
    if (!p) { segStart = true; prev = null; return; }
    if (segStart) { d += `M${p[0].toFixed(1)},${p[1].toFixed(1)}`; segStart = false; }
    else if (smooth && prev) {
      const cx = (prev[0] + p[0]) / 2;
      d += ` C${cx.toFixed(1)},${prev[1].toFixed(1)} ${cx.toFixed(1)},${p[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    } else d += ` L${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    prev = p;
  });
  const valid = pts.filter(Boolean);
  const area = valid.length > 1 ? `${d} L${valid.at(-1)[0].toFixed(1)},${H - padB} L${valid[0][0].toFixed(1)},${H - padB} Z` : '';

  const ticks = [lo, (lo + hi) / 2, hi];
  const step = Math.max(1, Math.ceil(n / 7));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafiek">
    ${gradientDefs(id)}
    ${ticks.map((t) => `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${Math.round(t * 10) / 10}</text>`).join('')}
    ${target != null ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : ''}
    ${area ? `<path class="area" d="${area}" fill="url(#${id}a)"/>` : ''}
    <path class="line" d="${d}" stroke="url(#${id})" style="--len:1400"/>
    ${pts.map((p, i) => (p ? `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="${i === n - 1 ? 4.5 : 3}" fill="${i === n - 1 ? '#38e8ff' : '#7a6cff'}"><title>${esc(labels[i] || '')}: ${values[i]}${unit}</title></circle>` : '')).join('')}
    ${labels.map((l, i) => (i % step === 0 || i === n - 1 ? `<text class="axis-label" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : '')).join('')}
  </svg>`;
}

/** Staafgrafiek. */
export function barChart(values, { labels = [], height = 150, target = null, unit = '', showValues = true } = {}) {
  const id = gid('bc');
  const W = 340, H = height, padL = 8, padR = 8, padT = 16, padB = 22;
  const hi = Math.max(1, ...values, target ?? 0) * 1.12;
  const n = values.length;
  const slot = (W - padL - padR) / n;
  const bw = Math.min(28, slot * 0.58);
  const y = (v) => padT + (1 - v / hi) * (H - padT - padB);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Staafgrafiek">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#4d7cff"/><stop offset="1" stop-color="#38e8ff"/></linearGradient>
    <linearGradient id="${id}t" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#7a3cff"/><stop offset="1" stop-color="#d07bff"/></linearGradient></defs>
    <line class="axis" x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}"/>
    ${target != null ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : ''}
    ${values.map((v, i) => {
      const cx = padL + slot * i + slot / 2;
      const top = y(v);
      const h = Math.max(v > 0 ? 3 : 0, H - padB - top);
      const last = i === n - 1;
      return `<rect class="bar-rect" x="${cx - bw / 2}" y="${H - padB - h}" width="${bw}" height="${h}" rx="${Math.min(7, bw / 2)}" fill="url(#${last ? id + 't' : id})" style="animation-delay:${i * 40}ms"><title>${esc(labels[i] || '')}: ${v}${unit}</title></rect>
        ${showValues && v > 0 ? `<text class="val-label" x="${cx}" y="${H - padB - h - 4}" text-anchor="middle">${Math.round(v * 10) / 10}</text>` : ''}
        <text class="axis-label" x="${cx}" y="${H - 6}" text-anchor="middle">${esc(labels[i] || '')}</text>`;
    }).join('')}
  </svg>`;
}

/** Mini-sparkline voor tegels. */
export function sparkline(values, { height = 26 } = {}) {
  const id = gid('sp');
  const nums = values.map((v) => (v == null ? null : v));
  const valid = nums.filter((v) => v != null);
  if (valid.length < 2) return '';
  const W = 120, H = height;
  const lo = Math.min(...valid), hi = Math.max(...valid);
  const x = (i) => (i * W) / (nums.length - 1);
  const y = (v) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (H - 4);
  let d = '';
  let pen = false;
  nums.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  return `<svg class="chart spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gradientDefs(id)}<path class="line" d="${d}" stroke="url(#${id})" style="--len:400;stroke-width:2"/></svg>`;
}

// ---------- toast ----------
export function toast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ---------- haptiek (waar ondersteund) ----------
export function haptic(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* */ } }

// ---------- bottom sheet ----------
let openSheetEl = null;
export function openSheet(html, onMount) {
  closeSheet(true);
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  openSheetEl = root;
  const sheet = root.querySelector('.sheet');
  root.querySelector('.sheet-backdrop').addEventListener('click', () => closeSheet());
  // sleep omlaag om te sluiten
  let startY = null;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
  });
  onMount && onMount(sheet);
  return sheet;
}
export function closeSheet(instant = false) {
  if (!openSheetEl) return;
  const root = openSheetEl;
  openSheetEl = null;
  if (instant) { root.innerHTML = ''; return; }
  root.querySelector('.sheet')?.classList.add('closing');
  root.querySelector('.sheet-backdrop')?.classList.add('closing');
  setTimeout(() => { if (!openSheetEl) root.innerHTML = ''; }, 280);
}
