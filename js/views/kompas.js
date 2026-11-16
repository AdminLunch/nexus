// NEXUS — Kompas (middenknop in de tabbalk): 💬 Gesprek en 🧭 Mijn Kompas.
// Het gesprek is de vroegere AI-chat, uitgebreid met het Open Kompas. Mijn Kompas toont wat
// de gebruiker zelf bewaarde, als bolletjes per windrichting; alles is te bevestigen, aan te
// passen, te archiveren of te wissen. Speels, zonder punten of druk (Open Kompas).
import { getState, update, today, prioritiesFor, dayScore, changeWater } from '../store.js';
import { esc, openSheet, closeSheet, toast, ask, haptic, MOODS } from '../ui.js';
import { memory as M } from '../kompas/index.js';
import * as chat from './ai.js';
import { setBodyTab } from './body.js';

let sub = 'gesprek';
export function setKompasTab(id) { if (id === 'gesprek' || id === 'kompas') sub = id; }

const TYPE = {
  value: { e: '💗', l: 'Wat je belangrijk vindt', dir: 0 },
  interest: { e: '✨', l: 'Waar je nieuwsgierig naar bent', dir: 90 },
  told: { e: '💬', l: 'Wat je me vertelde', dir: 180 },
  insight: { e: '🌿', l: 'Inzicht dat jij bevestigde', dir: 270 },
  possible: { e: '❓', l: 'Mogelijk verband — onbevestigd', dir: null },
};
const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const place = (deg, r) => { const a = (deg * Math.PI) / 180; return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) }; };

export function render(el) {
  el.innerHTML = `
    <h1 class="sr-only page-title">Kompas</h1>
    ${todayStrip()}
    <nav class="segmented kp-seg" id="kp-tabs" aria-label="Onderdelen Kompas">
      <button class="${sub === 'gesprek' ? 'on' : ''}" data-sub="gesprek" aria-pressed="${sub === 'gesprek'}">💬 Gesprek</button>
      <button class="${sub === 'kompas' ? 'on' : ''}" data-sub="kompas" aria-pressed="${sub === 'kompas'}">🧭 Mijn Kompas <span class="kp-badge" id="kp-count"></span></button>
    </nav>
    <div id="kp-sub"></div>`;
  const count = M.active(getState().kompas).length;
  const badge = el.querySelector('#kp-count');
  badge.textContent = count || '';
  badge.hidden = !count;
  const box = el.querySelector('#kp-sub');
  if (sub === 'gesprek') { el.classList.add('has-composer'); chat.render(box); el.classList.add('has-composer'); } else renderCompass(box);
  bindStrip(el);
  el.querySelector('#kp-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]');
    if (!b || b.dataset.sub === sub) return;
    sub = b.dataset.sub;
    el.classList.remove('has-composer');
    render(el);
    window.scrollTo(0, 0);
  });
}

// ---------------------------------------------------------------------------
// "Vandaag"-strook: snel iets doen zonder te praten (Open Kompas: niets opdringen)
// ---------------------------------------------------------------------------
function todayStrip() {
  const s = getState();
  const t = today();
  const open = prioritiesFor(t).filter((p) => !p.done);
  const mood = s.moods[t]?.mood;
  const water = s.water[t] || 0;
  return `<section class="kp-today" aria-label="Vandaag">
    <div class="kp-today-top">
      <span class="kp-score"><b class="mono">${dayScore(t)}</b><small>dagscore</small></span>
      <span class="kp-next">${open.length ? `<button class="kp-check" data-prio="${esc(open[0].id)}" aria-label="Afvinken: ${esc(open[0].text)}">○</button> ${esc(open[0].text)}` : prioritiesFor(t).length ? '✓ Alle prioriteiten klaar' : '<span class="card-note">Nog geen prioriteiten</span>'}</span>
      <a class="kp-more" href="#home">Vandaag →</a>
    </div>
    <div class="kp-today-quick">
      ${MOODS.map((m, i) => `<button class="kp-mood ${mood === i + 1 ? 'on' : ''}" data-mood="${i + 1}" aria-label="Stemming: ${esc(m.l)}">${m.e}</button>`).join('')}
      <button class="kp-water" id="kp-water" aria-label="Glas water erbij">💧 ${water}<small>/${s.settings.waterTarget || 8}</small> +</button>
      <a class="kp-water" href="#body" id="kp-eat" aria-label="Eten loggen">🍽️</a>
    </div>
  </section>`;
}

function bindStrip(el) {
  const t = today();
  el.querySelector('.kp-today')?.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mood]');
    if (m) { haptic(8); update((st) => { st.moods[t] = { ...(st.moods[t] || {}), mood: Number(m.dataset.mood) }; }); return; }
    const p = e.target.closest('[data-prio]');
    if (p) { haptic(12); update((st) => { const x = (st.priorities[t] || []).find((y) => y.id === p.dataset.prio); if (x) x.done = true; }); toast('Afgevinkt 🎯'); return; }
    if (e.target.closest('#kp-water')) { haptic(6); changeWater(t, 1); }
  });
  el.querySelector('#kp-eat')?.addEventListener('click', (e) => { e.preventDefault(); setBodyTab('voeding'); location.hash = 'body'; });
}

function renderCompass(el) {
  const k = getState().kompas;
  const L = M.layers(k);
  const MAX = 4;
  const SLOTS = [[-27, 41], [-9, 30], [9, 41], [27, 30]];
  const bubbles = [];
  for (const type of ['value', 'interest', 'told', 'insight']) {
    const items = L[type];
    const shown = items.slice(-(items.length > MAX ? MAX - 1 : MAX));
    const order = shown.length === 1 ? [[0, 36]] : shown.length === 2 ? [[-14, 38], [14, 30]] : shown.length === 3 ? [[-22, 40], [0, 29], [22, 40]] : SLOTS;
    shown.forEach((e, i) => {
      const [da, r] = order[i];
      const p = place(TYPE[type].dir + da, r);
      const anchor = type === 'interest' ? 'ae' : type === 'insight' ? 'aw' : '';
      bubbles.push(`<button class="kp-bubble ${type} ${anchor}" data-open="${esc(e.id)}" title="${esc(e.text)}" style="left:${p.x}%;top:${p.y}%;animation-delay:${(i * 0.7) % 3}s, ${i * 0.06}s"><span class="e">${TYPE[type].e}</span>${esc(short(e.text, 13))}</button>`);
    });
    if (items.length > MAX) { const p = place(TYPE[type].dir + 27, 30); bubbles.push(`<button class="kp-bubble more" data-more="${type}" style="left:${p.x}%;top:${p.y}%">+${items.length - MAX + 1}</button>`); }
  }
  L.possible.slice(-4).forEach((e, i) => {
    const p = place(45 + 90 * i, 17);
    bubbles.push(`<button class="kp-bubble possible" data-open="${esc(e.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(e.text)}"><span class="e">❓</span></button>`);
  });
  const n = M.active(k).length;
  el.innerHTML = `
    <div class="kp-compass-wrap">
      <div class="kp-compass">
        <div class="kp-ring r1"></div><div class="kp-ring r2"></div><div class="kp-ring r3"></div>
        <span class="kp-dir n">N<small>belangrijk</small></span><span class="kp-dir e">O<small>nieuwsgierig</small></span>
        <span class="kp-dir s">Z<small>verteld</small></span><span class="kp-dir w">W<small>inzichten</small></span>
        <div class="kp-needle"></div><div class="kp-core">jij</div>
        ${bubbles.join('')}
      </div>
      <p class="hint" style="text-align:center">${n ? `${n} ${n === 1 ? 'ding' : 'dingen'} in je kompas. Tik op een bolletje om het te bekijken, te bevestigen, aan te passen of te wissen.` : 'Je kompas is nog leeg. Alles wat jij in het gesprek kiest te bewaren verschijnt hier als bolletje. Er wordt niets bewaard zonder jouw keuze.'}</p>
    </div>
    <div class="kp-row" style="justify-content:center;margin:12px 0">
      <button class="btn ghost sm" id="kp-add">＋ Zelf iets toevoegen</button>
      <button class="btn ghost sm" id="kp-talk">💬 Naar het gesprek</button>
    </div>
    <section class="card">
      <div class="card-head"><h2 class="card-title">📦 Archief</h2><span class="card-note">${L.archive.length || ''}</span></div>
      ${L.archive.length ? L.archive.map((e) => e.status === 'deleted'
        ? `<div class="restore-row"><span>🗑️ Verwijderd (inhoud gewist)</span><button class="btn ghost sm" data-op="purge" data-id="${esc(e.id)}">Spoor wissen</button></div>`
        : `<div class="restore-row"><span>${e.status === 'corrected' ? '✋' : '🕰️'} ${esc(short(e.text, 40))}</span><span><button class="btn ghost sm" data-op="restore" data-id="${esc(e.id)}">Terug</button> <button class="btn ghost sm" data-op="remove" data-id="${esc(e.id)}">Wissen</button></span></div>`).join('')
        : '<div class="empty">Leeg. Wat niet meer klopt of niet meer actueel is, komt hier en telt dan niet meer mee.</div>'}
    </section>
    <button class="btn danger block" id="kp-wipe" style="margin-top:12px">Mijn Kompas helemaal wissen</button>`;

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.open) return openItem(b.dataset.open);
    if (b.dataset.more) return openMore(b.dataset.more);
    if (b.dataset.op) return itemOp(b.dataset.op, b.dataset.id);
    if (b.id === 'kp-add') return openAdd();
    if (b.id === 'kp-talk') { sub = 'gesprek'; window.scrollTo(0, 0); return update(() => {}); }
    if (b.id === 'kp-wipe') {
      if (!(await ask('Alles in Mijn Kompas wissen? Je gesprekken en andere NEXUS-gegevens blijven staan.', { ok: 'Wissen', danger: true }))) return;
      update((st) => { st.kompas = M.wipeAll(st.kompas, { by: 'user' }); });
      toast('Mijn Kompas gewist');
    }
  });
}

function openItem(id) {
  const e = getState().kompas.entries.find((x) => x.id === id);
  if (!e) return;
  const t = TYPE[e.type];
  const possible = e.type === 'possible';
  openSheet(`
    <span class="kp-kind ${possible ? 'possible' : ''}">${t.e} ${esc(t.l)}</span>
    <h2 style="margin-top:8px">${esc(e.text)}</h2>
    ${possible ? `<p class="hint">Dit is een vermoeden — geen feit. Het kan ook anders zitten:</p><ul class="kp-alts">${(e.alternatives || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <p class="hint">${e.origin === 'user' ? 'Door jou' : 'Door NEXUS geopperd'} · ${esc(new Date(e.updatedAt).toLocaleDateString('nl-NL'))}</p>
    <div class="grid-2" id="kp-acts">
      <button class="btn" data-op="${possible ? 'confirm' : 'reaffirm'}" data-id="${esc(e.id)}">${possible ? '✅ Klopt' : '✅ Klopt nog'}</button>
      <button class="btn ghost" data-op="edit" data-id="${esc(e.id)}">✏️ Aanpassen</button>
      <button class="btn ghost" data-op="outdated" data-id="${esc(e.id)}">🕰️ Niet meer actueel</button>
      <button class="btn ghost" data-op="correct" data-id="${esc(e.id)}">✋ Klopt niet</button>
    </div>
    <button class="btn danger block" data-op="remove" data-id="${esc(e.id)}" style="margin-top:10px">🗑️ Wissen</button>
  `, (sheet) => sheet.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-op]'); if (b) itemOp(b.dataset.op, b.dataset.id, sheet);
  }));
}

function openMore(type) {
  const items = M.layers(getState().kompas)[type];
  openSheet(`<span class="kp-kind">${TYPE[type].e} ${esc(TYPE[type].l)}</span>
    <div class="suggest" style="margin-top:12px">${items.map((e) => `<button class="chip" data-open="${esc(e.id)}">${esc(short(e.text, 40))}</button>`).join('')}</div>`,
  (sheet) => sheet.addEventListener('click', (ev) => { const b = ev.target.closest('[data-open]'); if (b) { closeSheet(true); openItem(b.dataset.open); } }));
}

async function itemOp(op, id, sheet) {
  const by = 'user';
  const e = getState().kompas.entries.find((x) => x.id === id);
  if (!e) return;
  let next = null;
  try {
    if (op === 'confirm' || op === 'reaffirm') { next = M.confirm(getState().kompas, id, { by }); haptic(12); }
    if (op === 'outdated') next = M.markOutdated(getState().kompas, id, { by });
    if (op === 'restore') next = M.restore(getState().kompas, id, { by });
    if (op === 'remove') next = M.remove(getState().kompas, id, { by });
    if (op === 'purge') next = M.purge(getState().kompas, id, { by });
    if (op === 'edit') { closeSheet(true); return openTextSheet('Pas aan in je eigen woorden', e.text, (text) => { update((st) => { st.kompas = M.edit(st.kompas, id, { by, text }); }); }); }
    if (op === 'correct') { closeSheet(true); return openTextSheet('Wat klopt er niet? Hoe zit het wel? (mag leeg)', '', (text) => { update((st) => { st.kompas = M.correct(st.kompas, id, { by, correction: text }); }); toast('Gearchiveerd — NEXUS komt er niet op terug'); }, true); }
  } catch (err) { toast(err.message); return; }
  if (sheet) closeSheet();
  if (next) update((st) => { st.kompas = next; });
}

function openTextSheet(title, value, onSave, allowEmpty = false) {
  openSheet(`<h2>${esc(title)}</h2><form id="kp-text-form" autocomplete="off"><div class="field"><input class="input" id="kp-text" maxlength="300" value="${esc(value)}"></div><button class="btn block">Opslaan</button></form>`, (sheet) => {
    sheet.querySelector('#kp-text-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = sheet.querySelector('#kp-text').value.trim();
      if (!t && !allowEmpty) return;
      closeSheet();
      onSave(t);
    });
    setTimeout(() => sheet.querySelector('#kp-text')?.focus(), 300);
  });
}

function openAdd() {
  let type = 'told';
  const LBL = { told: 'Iets wat ik vertel', value: 'Iets wat ik belangrijk vind', interest: 'Waar ik nieuwsgierig naar ben', insight: 'Een eigen inzicht' };
  openSheet(`<h2>Zelf iets toevoegen</h2><p class="hint">In je eigen woorden. Je kunt het later altijd aanpassen of wissen.</p>
    <div class="kp-types" id="kp-types">${Object.keys(LBL).map((k) => `<button type="button" class="kp-card ${k === type ? 'on' : ''}" data-type="${k}"><span class="e">${TYPE[k].e}</span><b>${LBL[k]}</b></button>`).join('')}</div>
    <form id="kp-add-form" autocomplete="off"><div class="field"><input class="input" id="kp-add-text" maxlength="200" placeholder="Bijv. ik hou van lange wandelingen"></div><button class="btn block">📌 Bewaar in mijn kompas</button></form>`, (sheet) => {
    sheet.querySelector('#kp-types').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-type]'); if (!c) return;
      type = c.dataset.type;
      sheet.querySelectorAll('#kp-types .kp-card').forEach((x) => x.classList.toggle('on', x === c));
    });
    sheet.querySelector('#kp-add-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = sheet.querySelector('#kp-add-text').value.trim();
      if (!text) return;
      const fn = { told: M.addTold, value: M.addValue, interest: M.addInterest, insight: M.addOwnInsight }[type];
      closeSheet();
      update((st) => { st.kompas = fn(st.kompas, text); });
      toast('📌 Bewaard in je kompas');
    });
  });
}
