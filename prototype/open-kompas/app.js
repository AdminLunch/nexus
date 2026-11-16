// Open Kompas — afzonderlijk testbaar prototype. Niet gekoppeld aan de NEXUS-app,
// store.js of de AI-engine. Gebruikt alleen een in-memory opslag: herladen wist alles.
import { startSession, respond, CORE_ACTIONS, buildKompasContext, applyOps, proposalToOp, createInMemoryAdapter, createKompasRepository, memory as M, guards } from '../../js/kompas/index.js';
import { esc } from '../../js/kompas/util.js';

const repo = createKompasRepository(createInMemoryAdapter());
const $ = (s) => document.querySelector(s);

const ui = { memory: null, session: null, reply: null, messages: [], sessionsStarted: 0, proposals: [] };

/** Fictieve demo-persoon. Items zijn "200 dagen oud" zodat de herijking zichtbaar wordt. */
function demoMemory() {
  const old = new Date(Date.now() - 200 * 86400000);
  let m = M.createMemory({ now: old });
  m = M.addTold(m, 'Ik werk sinds kort in ploegendienst', { now: old, topics: ['werk'] });
  m = M.addValue(m, 'Eerlijkheid', { now: old });
  m = M.addInterest(m, 'Vogels tekenen', { now: new Date(), topics: ['creatief', 'natuur'] });
  m = M.addPossible(m, 'Misschien hangen slecht slapen en de late diensten samen', { now: new Date(), topics: ['slaap', 'werk'], alternatives: ['Het kan ook aan de buren liggen.'] });
  return m;
}

async function persist() { await repo.save(ui.memory); }

function begin({ first }) {
  ui.sessionsStarted += 1;
  const { session, reply } = startSession({ memory: ui.memory, isFirstSession: first, preferences: ui.session?.preferences });
  ui.session = session;
  ui.messages.push({ role: 'divider', text: first ? 'Eerste kennismaking' : `Vervolgsessie ${ui.sessionsStarted}` });
  show(reply);
}

function show(reply) {
  ui.reply = reply;
  ui.messages.push({ role: 'nexus', text: reply.text, move: reply.move });
  ui.proposals = reply.proposals;
  render();
}

async function send(input) {
  ui.messages.push(input.type === 'text'
    ? { role: 'user', text: input.text }
    : { role: 'user', action: true, text: labelFor(input.id) });
  const r = respond(ui.session, ui.memory, input);
  ui.session = r.session;
  if (r.memoryOps.length) { ui.memory = applyOps(ui.memory, r.memoryOps); await persist(); }
  show(r.reply);
}

function labelFor(id) {
  const all = [...CORE_ACTIONS, ...(ui.reply?.actions || [])];
  return `→ ${all.find((a) => a.id === id)?.label || id}`;
}

// ---------------------------------------------------------------------------
// Weergave
// ---------------------------------------------------------------------------

const MOVE_TAG = { reflect: 'mogelijk verband — onbevestigd', practical: 'praktisch', 'tool-offer': 'optioneel', tool: 'oefening', safety: 'veiligheid', review: 'herijking', recall: 'eerder verteld' };

function render() {
  $('#messages').innerHTML = ui.messages.map((m) => {
    if (m.role === 'divider') return `<div class="hint">— ${esc(m.text)} —</div>`;
    const tag = m.role === 'nexus' && MOVE_TAG[m.move] ? `<span class="tag">${esc(MOVE_TAG[m.move])}</span><br>` : '';
    return `<div class="msg ${m.role} ${m.action ? 'action' : ''} ${m.move || ''}" data-move="${esc(m.move || '')}">${tag}${esc(m.text)}</div>`;
  }).join('');
  $('#messages').scrollTop = $('#messages').scrollHeight;

  $('#context-actions').innerHTML = (ui.reply?.actions || []).map((a, i) => `<button class="chip ctx" data-ctx="${i}">${esc(a.label)}</button>`).join('');
  $('#core-actions').innerHTML = CORE_ACTIONS.map((a) => `<button class="chip" data-core="${a.id}">${esc(a.label)}</button>`).join('');
  $('#proposals').innerHTML = ui.proposals.map((p, i) => `<div class="proposal"><span>Onthouden als <b>${esc(LAYER_NAME[p.type])}</b>: “${esc(p.text)}”?</span>
      <button class="mini" data-accept="${i}">Onthouden</button><button class="mini" data-dismiss="${i}">Nee</button></div>`).join('');
  renderMemory();
  renderGuards();
}

const LAYER_NAME = { told: 'iets wat je vertelde', value: 'iets wat je belangrijk vindt', interest: 'een interesse' };

function renderMemory() {
  const L = M.layers(ui.memory);
  const order = ['told', 'value', 'interest', 'insight', 'possible', 'archive'];
  $('#layers').innerHTML = order.map((k) => {
    const items = L[k];
    const body = items.length ? items.map((e) => itemHTML(e, k === 'archive')).join('') : '<div class="empty">Nog niets.</div>';
    return `<h3>${esc(M.LAYER_LABELS[k])}</h3>${body}`;
  }).join('');
}

function itemHTML(e, archivedView) {
  if (e.status === 'deleted') return `<div class="item archived" data-id="${esc(e.id)}"><span class="meta">Verwijderd item (inhoud gewist)</span><div class="controls"><button class="mini danger" data-op="purge">Spoor wissen</button></div></div>`;
  const possible = e.type === 'possible';
  const controls = archivedView
    ? `<button class="mini" data-op="restore">Terugzetten</button><button class="mini danger" data-op="remove">Wissen</button>`
    : `${possible ? '<button class="mini" data-op="confirm">Klopt</button>' : '<button class="mini" data-op="reaffirm">Klopt nog</button>'}
       <button class="mini" data-op="edit">Aanpassen</button>
       <button class="mini" data-op="outdated">Niet meer actueel</button>
       <button class="mini" data-op="correct">Klopt niet</button>
       <button class="mini danger" data-op="remove">Wissen</button>`;
  const status = archivedView ? ` · ${{ outdated: 'verouderd', corrected: 'gecorrigeerd' }[e.status] || e.status}` : '';
  return `<div class="item ${possible ? 'possible' : ''} ${archivedView ? 'archived' : ''}" data-id="${esc(e.id)}">
    ${possible ? '<div class="label">ONBEVESTIGD — door NEXUS geopperd</div>' : ''}
    <div>${esc(e.text)}</div>
    ${possible && e.alternatives ? `<ul class="alts">${e.alternatives.map((a) => `<li>Of: ${esc(a)}</li>`).join('')}</ul>` : ''}
    <div class="meta">${e.origin === 'user' ? 'door jou' : 'door NEXUS'}${status} · ${new Date(e.updatedAt).toLocaleDateString('nl-NL')}</div>
    <div class="controls">${controls}</div>
  </div>`;
}

function renderGuards() {
  const r = ui.reply;
  const lint = r?.guard?.lint;
  const report = ui.session ? guards.tunnelReport(ui.session) : null;
  const ctx = buildKompasContext(ui.memory);
  $('#guard-info').innerHTML = `
    <p>Taalcontrole laatste antwoord: ${lint?.ok ? '<span class="ok">geen schendingen</span>' : `<span class="bad">${esc(JSON.stringify(lint?.violations))}</span>`}</p>
    ${r?.guard?.interpretation ? `<p>Psychologische duiding toegestaan: ${r.guard.interpretation.allowed ? 'ja' : `nee — ${esc(r.guard.interpretation.reasons.join('; '))}`}</p>` : ''}
    <p>Tunnelvisie: NEXUS trok terug naar ${report?.nexusPulledBack.length ? esc(report.nexusPulledBack.join(', ')) : '<span class="ok">niets</span>'} · domeinen deze sessie: ${report?.domainVariety ?? 0} · aandeel interpretaties: ${Math.round((report?.interpretRatio || 0) * 100)}%</p>
    <p>Wat een toekomstige AI (na P0 en met toestemming) zou krijgen:</p>
    <pre>${esc(JSON.stringify(ctx, null, 2))}</pre>`;
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
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.core) return send({ type: 'action', id: b.dataset.core });
  if (b.dataset.ctx != null) { const a = ui.reply.actions[Number(b.dataset.ctx)]; return send({ type: 'action', id: a.id, payload: a.payload }); }
  if (b.dataset.accept != null) {
    const p = ui.proposals[Number(b.dataset.accept)];
    ui.memory = applyOps(ui.memory, [proposalToOp(p)]);
    ui.proposals = ui.proposals.filter((x) => x !== p);
    await persist();
    return render();
  }
  if (b.dataset.dismiss != null) { ui.proposals.splice(Number(b.dataset.dismiss), 1); return render(); }
  if (b.dataset.op) return itemOp(b.dataset.op, b.closest('.item').dataset.id);
});

async function itemOp(op, id) {
  const by = 'user';
  const e = ui.memory.entries.find((x) => x.id === id);
  try {
    if (op === 'confirm' || op === 'reaffirm') ui.memory = M.confirm(ui.memory, id, { by });
    if (op === 'outdated') ui.memory = M.markOutdated(ui.memory, id, { by });
    if (op === 'restore') ui.memory = M.restore(ui.memory, id, { by });
    if (op === 'remove') ui.memory = M.remove(ui.memory, id, { by });
    if (op === 'purge') ui.memory = M.purge(ui.memory, id, { by });
    if (op === 'edit') {
      const text = window.prompt('Pas aan in je eigen woorden:', e.text);
      if (text && text.trim()) ui.memory = M.edit(ui.memory, id, { by, text });
    }
    if (op === 'correct') {
      const correction = window.prompt('Wat klopt er niet? Hoe zit het wel? (mag leeg)', '');
      ui.memory = M.correct(ui.memory, id, { by, correction: correction || '' });
    }
    await persist();
  } catch (err) {
    window.alert(err.message);
  }
  render();
}

$('#add-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('#add-text').value.trim();
  if (!text) return;
  const type = $('#add-type').value;
  const fn = { told: M.addTold, value: M.addValue, interest: M.addInterest, insight: M.addOwnInsight }[type];
  ui.memory = fn(ui.memory, text);
  $('#add-text').value = '';
  await persist();
  render();
});

$('#btn-wipe').addEventListener('click', async () => {
  if (!window.confirm('Alles in Mijn Kompas wissen?')) return;
  ui.memory = M.wipeAll(ui.memory, { by: 'user' });
  await repo.wipe();
  render();
});

$('#btn-demo').addEventListener('click', async () => {
  ui.memory = demoMemory();
  await persist();
  ui.messages.push({ role: 'divider', text: 'Fictieve demo-persoon geladen (synthetisch)' });
  render();
});

$('#btn-new-session').addEventListener('click', () => begin({ first: false }));

// Start
ui.memory = await repo.load();
begin({ first: true });
window.KOMPAS_PROTO = { get state() { return ui; } };
