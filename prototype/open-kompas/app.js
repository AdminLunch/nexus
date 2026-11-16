// Open Kompas — speels, afzonderlijk testbaar prototype. Niet gekoppeld aan de NEXUS-app,
// store.js of de AI-engine. Alleen in het geheugen: herladen wist alles. Alleen fictieve gegevens.
// Speels ≠ druk: geen punten, reeksen of beloningen voor delen (Open Kompas).
import { startSession, respond, CORE_ACTIONS, buildKompasContext, applyOps, proposalToOp, createInMemoryAdapter, createKompasRepository, memory as M, guards } from '../../js/kompas/index.js';
import { esc } from '../../js/kompas/util.js';

const repo = createKompasRepository(createInMemoryAdapter());
const $ = (s) => document.querySelector(s);
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ui = { memory: null, session: null, reply: null, messages: [], sessionsStarted: 0, proposals: [], typing: false, lastType: null };

// ---------------------------------------------------------------------------
// Iconen en teksten
// ---------------------------------------------------------------------------
const CORE = { deeper: ['🔍', 'Dieper'], angle: ['🔄', 'Andere kant'], switch: ['🎲', 'Iets anders'], practical: ['🛠️', 'Praktisch'], skip: ['⏭️', 'Overslaan'], disagree: ['✋', 'Klopt niet'] };
const CTX_ICON = {
  'intro-why': '👋', 'intro-free': '🌱', 'intro-unsure': '🤷', practical: '🛠️', 'intro-how': '🔒', 'open-door': '🎲',
  'reflection-confirm': '✅', 'reflection-maybe': '🤔', disagree: '✋', skip: '🙈', 'review-still': '✅', 'review-outdated': '🕰️',
  'review-later': '⏳', 'recall-interest': '✨', 'tool-start': '📝', 'tools-off': '🚫', angle: '🔄', switch: '🎲',
};
const MOVE_TAG = { reflect: '💡 Mogelijk verband · onbevestigd', practical: '🛠️ Praktisch', 'tool-offer': '🧰 Optioneel', tool: '📝 Oefening', safety: '💗 Even stilstaan', review: '🕰️ Klopt dit nog?', recall: '↩️ Eerder verteld' };
const TYPE = {
  value: { e: '💗', l: 'Wat je belangrijk vindt', dir: 0 },
  interest: { e: '✨', l: 'Waar je nieuwsgierig naar bent', dir: 90 },
  told: { e: '💬', l: 'Wat je me vertelde', dir: 180 },
  insight: { e: '🌿', l: 'Inzicht dat jij bevestigde', dir: 270 },
  possible: { e: '❓', l: 'Mogelijk verband — onbevestigd', dir: null },
};
const LAYER_NAME = { told: 'iets wat je vertelde', value: 'iets wat je belangrijk vindt', interest: 'een interesse' };
const short = (t, n = 24) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Eigen dialoogvenster i.p.v. prompt/confirm/alert (die werken niet in een Claude-artifact). */
function dialog(message, { input = null, ok = 'OK', cancel = 'Annuleren' } = {}) {
  return new Promise((resolve) => {
    const root = $('#dialog-root');
    root.innerHTML = `<div class="dialog-backdrop"><form class="dialog" role="dialog" aria-modal="true">
      <p>${esc(message)}</p>
      ${input !== null ? `<input class="input" id="dlg-input" value="${esc(input)}" autocomplete="off">` : ''}
      <div class="dialog-actions">${cancel ? `<button type="button" class="ghost" data-r="0">${esc(cancel)}</button>` : ''}<button class="primary" data-r="1">${esc(ok)}</button></div>
    </form></div>`;
    const done = (v) => { root.innerHTML = ''; resolve(v); };
    root.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(input !== null ? root.querySelector('#dlg-input').value : true); });
    root.querySelector('[data-r="0"]')?.addEventListener('click', () => done(null));
    (root.querySelector('#dlg-input') || root.querySelector('[data-r="1"]')).focus();
  });
}

/** Fictieve demo-persoon. Items zijn "200 dagen oud" zodat de herijking zichtbaar wordt. */
function demoMemory() {
  const old = new Date(Date.now() - 200 * 86400000);
  let m = M.createMemory({ now: old });
  m = M.addTold(m, 'Ik werk sinds kort in ploegendienst', { now: old, topics: ['werk'] });
  m = M.addTold(m, 'Ik woon samen met twee katten', { now: new Date(), topics: ['natuur'] });
  m = M.addValue(m, 'Eerlijkheid', { now: old });
  m = M.addValue(m, 'Tijd voor vrienden', { now: new Date() });
  m = M.addInterest(m, 'Vogels tekenen', { now: new Date(), topics: ['creatief', 'natuur'] });
  m = M.addInterest(m, 'Sterrenkunde', { now: new Date(), topics: ['leren'] });
  m = M.addOwnInsight(m, 'Ik heb rustige ochtenden nodig om op te starten', { now: new Date() });
  m = M.addPossible(m, 'Misschien hangen slecht slapen en de late diensten samen', { now: new Date(), topics: ['slaap', 'werk'], alternatives: ['Het kan ook aan de buren liggen.'] });
  return m;
}

async function persist() { await repo.save(ui.memory); }

// ---------------------------------------------------------------------------
// Gespreksverloop
// ---------------------------------------------------------------------------
function begin({ first }) {
  ui.sessionsStarted += 1;
  const { session, reply } = startSession({ memory: ui.memory, isFirstSession: first, preferences: ui.session?.preferences });
  ui.session = session;
  ui.messages.push({ role: 'divider', text: first ? 'Kennismaking' : `Nieuwe sessie ${ui.sessionsStarted}` });
  show(reply);
}

function show(reply) {
  const put = () => {
    ui.typing = false;
    ui.reply = reply;
    ui.messages.push({ role: 'nexus', text: reply.text, move: reply.move });
    ui.proposals = reply.proposals;
    render();
  };
  if (calm() || navigator.webdriver) { put(); return; }
  ui.typing = true;
  ui.reply = { ...reply, actions: [] };
  render();
  setTimeout(put, 520);
}

async function send(input) {
  if (ui.typing) return;
  ui.messages.push(input.type === 'text'
    ? { role: 'user', text: input.text }
    : { role: 'user', action: true, text: labelFor(input.id) });
  const r = respond(ui.session, ui.memory, input);
  ui.session = r.session;
  if (r.memoryOps.length) {
    const before = M.active(ui.memory).length;
    ui.memory = applyOps(ui.memory, r.memoryOps);
    await persist();
    if (M.active(ui.memory).length > before) { const last = ui.memory.entries.at(-1); ui.lastType = last?.type; flyToKompas(document.activeElement, last?.type === 'insight' ? '🌿' : '❓'); }
  }
  show(r.reply);
}

function labelFor(id) {
  if (CORE[id]) return `${CORE[id][0]} ${CORE[id][1]}`;
  const a = (ui.reply?.actions || []).find((x) => x.id === id);
  return `${CTX_ICON[id] || '✦'} ${a?.label || id}`;
}

// ---------------------------------------------------------------------------
// Weergave: gesprek
// ---------------------------------------------------------------------------
function render() {
  $('#messages').innerHTML = ui.messages.map((m) => {
    if (m.role === 'divider') return `<div class="divider">✦ ${esc(m.text)} ✦</div>`;
    if (m.role === 'user') return `<div class="row user ${m.action ? 'action' : ''}"><div class="bubble">${esc(m.text)}</div></div>`;
    const tag = MOVE_TAG[m.move] ? `<div class="tag">${esc(MOVE_TAG[m.move])}</div>` : '';
    return `<div class="row nexus ${esc(m.move || '')}" data-move="${esc(m.move || '')}"><span class="avatar" aria-hidden="true"></span><div class="bubble msg">${tag}${esc(m.text)}</div></div>`;
  }).join('') + (ui.typing ? '<div class="row nexus typing"><span class="avatar"></span><div class="bubble" aria-label="NEXUS typt"><i></i><i></i><i></i></div></div>' : '');
  const last = $('#messages').lastElementChild;
  if (last && !calm()) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  $('#context-actions').innerHTML = (ui.reply?.actions || []).map((a, i) => `<button class="card-btn" data-ctx="${i}"><span class="e">${CTX_ICON[a.id] || '✦'}</span><b>${esc(a.label)}</b></button>`).join('');
  $('#core-actions').innerHTML = CORE_ACTIONS.map((a) => `<button class="joy" data-core="${a.id}" title="${esc(a.label)}" aria-label="${esc(a.label)}"><span class="ic">${CORE[a.id][0]}</span>${esc(CORE[a.id][1])}</button>`).join('');
  $('#proposals').innerHTML = ui.proposals.map((p, i) => `<div class="proposal"><span>✨ Wil je dit bewaren als <b>${esc(LAYER_NAME[p.type])}</b>?<br>“${esc(p.text)}”</span>
      <button class="primary" data-accept="${i}">📌 Bewaar</button><button class="ghost" data-dismiss="${i}">Nee, dank je</button></div>`).join('');
  renderKompas();
  renderGuards();
}

// ---------------------------------------------------------------------------
// Weergave: het kompas
// ---------------------------------------------------------------------------
function place(angleDeg, radiusPct) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: 50 + radiusPct * Math.sin(a), y: 50 - radiusPct * Math.cos(a) };
}

function renderKompas() {
  const L = M.layers(ui.memory);
  const html = [];
  const MAX = 4;
  // Per richting hoogstens 4 bolletjes, afwisselend op de binnen- en buitenring zodat ze niet overlappen.
  const SLOTS = [[-27, 41], [-9, 30], [9, 41], [27, 30]];
  for (const type of ['value', 'interest', 'told', 'insight']) {
    const items = L[type];
    const shown = items.slice(-(items.length > MAX ? MAX - 1 : MAX));
    const order = shown.length === 1 ? [[0, 36]] : shown.length === 2 ? [[-14, 38], [14, 30]] : shown.length === 3 ? [[-22, 40], [0, 29], [22, 40]] : SLOTS;
    shown.forEach((e, i) => {
      const [da, r] = order[i];
      const p = place(TYPE[type].dir + da, r);
      const anchor = type === 'interest' ? 'ae' : type === 'insight' ? 'aw' : '';
      html.push(`<button class="bubble-item ${type} ${anchor}" data-open="${esc(e.id)}" title="${esc(e.text)}" style="left:${p.x}%;top:${p.y}%;animation-delay:${(i * 0.7) % 3}s, ${i * 0.06}s"><span class="e">${TYPE[type].e}</span>${esc(short(e.text, 13))}</button>`);
    });
    if (items.length > MAX) {
      const [da, r] = SLOTS[3];
      const p = place(TYPE[type].dir + da, r);
      html.push(`<button class="bubble-item more" data-more="${type}" style="left:${p.x}%;top:${p.y}%">+${items.length - MAX + 1}</button>`);
    }
  }
  L.possible.slice(-4).forEach((e, i) => {
    const p = place(45 + 90 * i, 17);
    html.push(`<button class="bubble-item possible" data-open="${esc(e.id)}" style="left:${p.x}%;top:${p.y}%" title="${esc(e.text)}"><span class="e">❓</span><span class="sr">${esc(short(e.text, 30))}</span></button>`);
  });
  $('#bubbles').innerHTML = html.join('');

  const activeCount = M.active(ui.memory).length;
  const badge = $('#kompas-count');
  badge.hidden = !activeCount;
  badge.textContent = activeCount;
  $('#compass-hint').textContent = activeCount
    ? `${activeCount} ${activeCount === 1 ? 'ding' : 'dingen'} in je kompas. Tik op een bolletje om het te bekijken, te bevestigen, aan te passen of te wissen.`
    : 'Je kompas is nog leeg. Alles wat jij kiest te bewaren verschijnt hier als bolletje. Er wordt niets bewaard zonder jouw keuze.';
  // De naald draait naar de laatst gegroeide richting — puur speels, zonder betekenis over jou.
  const dir = TYPE[ui.lastType]?.dir;
  $('.needle').style.transform = `rotate(${dir ?? 0}deg)`;

  const arch = L.archive;
  $('#archive-count').textContent = arch.length ? `(${arch.length})` : '';
  $('#archive-list').innerHTML = arch.length ? arch.map((e) => e.status === 'deleted'
    ? `<div class="arch-row"><span>🗑️ Verwijderd (inhoud gewist)</span><button class="ghost" data-op="purge" data-id="${esc(e.id)}">Spoor wissen</button></div>`
    : `<div class="arch-row"><span>${e.status === 'corrected' ? '✋' : '🕰️'} ${esc(short(e.text, 40))}</span><span><button class="ghost" data-op="restore" data-id="${esc(e.id)}">Terugzetten</button> <button class="ghost danger" data-op="remove" data-id="${esc(e.id)}">Wissen</button></span></div>`).join('')
    : '<p class="hint">Leeg. Wat niet meer klopt of niet meer actueel is, komt hier — het telt dan niet meer mee.</p>';
}

function renderGuards() {
  const r = ui.reply;
  const lint = r?.guard?.lint;
  const report = ui.session ? guards.tunnelReport(ui.session) : null;
  const ctx = buildKompasContext(ui.memory);
  $('#guard-info').innerHTML = `
    <p>Taalcontrole laatste antwoord: ${lint?.ok !== false ? '<span class="ok">geen schendingen</span>' : `<span class="bad">${esc(JSON.stringify(lint?.violations))}</span>`}</p>
    ${r?.guard?.interpretation ? `<p>Psychologische duiding toegestaan: ${r.guard.interpretation.allowed ? 'ja' : `nee — ${esc(r.guard.interpretation.reasons.join('; '))}`}</p>` : ''}
    <p>Tunnelvisie: NEXUS trok terug naar ${report?.nexusPulledBack.length ? esc(report.nexusPulledBack.join(', ')) : '<span class="ok">niets</span>'} · domeinen deze sessie: ${report?.domainVariety ?? 0} · aandeel interpretaties: ${Math.round((report?.interpretRatio || 0) * 100)}%</p>
    <p>Wat een toekomstige AI (na P0 en met toestemming) zou krijgen:</p>
    <pre>${esc(JSON.stringify(ctx, null, 2))}</pre>`;
}

// ---------------------------------------------------------------------------
// Onderbladen
// ---------------------------------------------------------------------------
function openSheet(html) {
  $('#sheet-root').innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
}
const closeSheet = () => { $('#sheet-root').innerHTML = ''; };

function openItemSheet(id) {
  const e = ui.memory.entries.find((x) => x.id === id);
  if (!e) return;
  const t = TYPE[e.type];
  const possible = e.type === 'possible';
  openSheet(`
    <span class="kind ${possible ? 'possible' : ''}">${t.e} ${esc(t.l)}</span>
    <h3>${esc(e.text)}</h3>
    ${possible ? `<p class="hint" style="text-align:left">Dit is een vermoeden van NEXUS — geen feit. Het kan ook anders zitten:</p><ul class="alts">${(e.alternatives || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <div class="meta">${e.origin === 'user' ? 'Door jou' : 'Door NEXUS geopperd'} · ${new Date(e.updatedAt).toLocaleDateString('nl-NL')}</div>
    <div class="acts item" data-id="${esc(e.id)}">
      <button class="pill primary" data-op="${possible ? 'confirm' : 'reaffirm'}" data-id="${esc(e.id)}">${possible ? '✅ Klopt' : '✅ Klopt nog'}</button>
      <button class="pill" data-op="edit" data-id="${esc(e.id)}">✏️ Aanpassen</button>
      <button class="pill" data-op="outdated" data-id="${esc(e.id)}">🕰️ Niet meer actueel</button>
      <button class="pill" data-op="correct" data-id="${esc(e.id)}">✋ Klopt niet</button>
      <button class="pill danger" data-op="remove" data-id="${esc(e.id)}">🗑️ Wissen</button>
    </div>`);
}

function openMoreSheet(type) {
  const items = M.layers(ui.memory)[type];
  openSheet(`<span class="kind">${TYPE[type].e} ${esc(TYPE[type].l)}</span>
    <div class="acts">${items.map((e) => `<button class="pill" data-open="${esc(e.id)}">${esc(short(e.text, 40))}</button>`).join('')}</div>`);
}

function openAddSheet() {
  let type = 'told';
  openSheet(`<h3>Zelf iets toevoegen</h3><p class="hint" style="text-align:left">In je eigen woorden. Je kunt het later altijd aanpassen of wissen.</p>
    <div class="type-cards" id="add-types">
      ${['told', 'value', 'interest', 'insight'].map((k) => `<button class="card-btn ${k === type ? 'on' : ''}" data-type="${k}"><span class="e">${TYPE[k].e}</span><b>${esc({ told: 'Iets wat ik vertel', value: 'Iets wat ik belangrijk vind', interest: 'Waar ik nieuwsgierig naar ben', insight: 'Een eigen inzicht' }[k])}</b></button>`).join('')}
    </div>
    <form id="add-form" autocomplete="off" style="display:grid;gap:10px">
      <input class="input" id="add-text" placeholder="Bijv. ik hou van lange wandelingen" maxlength="200">
      <button class="primary">📌 Bewaar in mijn kompas</button>
    </form>`);
  $('#add-types').addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-type]'); if (!c) return;
    type = c.dataset.type;
    $('#add-types').querySelectorAll('.card-btn').forEach((x) => x.classList.toggle('on', x === c));
  });
  $('#add-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = $('#add-text').value.trim();
    if (!text) return;
    const fn = { told: M.addTold, value: M.addValue, interest: M.addInterest, insight: M.addOwnInsight }[type];
    ui.memory = fn(ui.memory, text);
    ui.lastType = type;
    await persist();
    closeSheet();
    sparks($('.core'));
    render();
  });
  setTimeout(() => $('#add-text')?.focus(), 300);
}

// ---------------------------------------------------------------------------
// Effecten (speels, zonder betekenis; uit bij "minder beweging")
// ---------------------------------------------------------------------------
function flyToKompas(fromEl, symbol = '✦') {
  if (calm()) return;
  const target = window.innerWidth >= 900 ? $('.core') : $('#tab-kompas');
  const a = (fromEl && fromEl !== document.body ? fromEl : $('#composer')).getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'fly';
  s.textContent = symbol;
  s.style.left = `${a.left + a.width / 2}px`;
  s.style.top = `${a.top + a.height / 2}px`;
  $('#fx-root').append(s);
  requestAnimationFrame(() => { s.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.4)`; s.style.opacity = '0.2'; });
  setTimeout(() => { s.remove(); const bd = $('#kompas-count'); bd.classList.remove('pop'); void bd.offsetWidth; bd.classList.add('pop'); }, 900);
}

function sparks(el) {
  if (calm() || !el) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    const ang = (i / 10) * Math.PI * 2;
    s.style.left = `${r.left + r.width / 2}px`;
    s.style.top = `${r.top + r.height / 2}px`;
    s.style.setProperty('--dx', `${Math.cos(ang) * 60}px`);
    s.style.setProperty('--dy', `${Math.sin(ang) * 60}px`);
    $('#fx-root').append(s);
    setTimeout(() => s.remove(), 850);
  }
}

function switchView(name) {
  document.querySelectorAll('.switch [data-view]').forEach((b) => { const on = b.dataset.view === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.dataset.view === name));
}

// ---------------------------------------------------------------------------
// Interactie
// ---------------------------------------------------------------------------
$('#composer').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  send({ type: 'text', text });
});

document.addEventListener('click', async (ev) => {
  if (ev.target.closest('[data-close]')) return closeSheet();
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.view) return switchView(b.dataset.view);
  if (b.dataset.core) {
    if (b.dataset.core === 'switch') { b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll'); }
    return send({ type: 'action', id: b.dataset.core });
  }
  if (b.dataset.ctx != null) { const a = ui.reply.actions[Number(b.dataset.ctx)]; return send({ type: 'action', id: a.id, payload: a.payload }); }
  if (b.dataset.accept != null) {
    const p = ui.proposals[Number(b.dataset.accept)];
    ui.memory = applyOps(ui.memory, [proposalToOp(p)]);
    ui.proposals = ui.proposals.filter((x) => x !== p);
    ui.lastType = p.type;
    await persist();
    flyToKompas(b, TYPE[p.type]?.e || '✦');
    return render();
  }
  if (b.dataset.dismiss != null) { ui.proposals.splice(Number(b.dataset.dismiss), 1); return render(); }
  if (b.dataset.open) return openItemSheet(b.dataset.open);
  if (b.dataset.more) return openMoreSheet(b.dataset.more);
  if (b.dataset.op) return itemOp(b.dataset.op, b.dataset.id || b.closest('[data-id]')?.dataset.id, b);
});

async function itemOp(op, id, btn) {
  const by = 'user';
  const e = ui.memory.entries.find((x) => x.id === id);
  try {
    if (op === 'confirm' || op === 'reaffirm') { ui.memory = M.confirm(ui.memory, id, { by }); ui.lastType = 'insight'; sparks(btn); }
    if (op === 'outdated') ui.memory = M.markOutdated(ui.memory, id, { by });
    if (op === 'restore') ui.memory = M.restore(ui.memory, id, { by });
    if (op === 'remove') ui.memory = M.remove(ui.memory, id, { by });
    if (op === 'purge') ui.memory = M.purge(ui.memory, id, { by });
    if (op === 'edit') {
      const text = await dialog('Pas aan in je eigen woorden:', { input: e.text, ok: 'Opslaan' });
      if (text && text.trim()) ui.memory = M.edit(ui.memory, id, { by, text });
    }
    if (op === 'correct') {
      const correction = await dialog('Wat klopt er niet? Hoe zit het wel? (mag leeg)', { input: '', ok: 'Klopt niet' });
      if (correction === null) return render();
      ui.memory = M.correct(ui.memory, id, { by, correction: correction || '' });
    }
    await persist();
  } catch (err) {
    await dialog(err.message, { cancel: null });
  }
  closeSheet();
  render();
}

$('#btn-add').addEventListener('click', openAddSheet);
$('#btn-wipe').addEventListener('click', async () => {
  if (!(await dialog('Alles in Mijn Kompas wissen?', { ok: 'Alles wissen' }))) return;
  ui.memory = M.wipeAll(ui.memory, { by: 'user' });
  ui.lastType = null;
  await repo.wipe();
  render();
});
$('#btn-demo').addEventListener('click', async () => {
  ui.memory = demoMemory();
  await persist();
  ui.messages.push({ role: 'divider', text: 'Fictieve demo-persoon geladen' });
  sparks($('.core'));
  render();
});
$('#btn-new-session').addEventListener('click', () => { switchView('chat'); begin({ first: false }); });

// Start
ui.memory = await repo.load();
begin({ first: true });
window.KOMPAS_PROTO = { get state() { return ui; } };
