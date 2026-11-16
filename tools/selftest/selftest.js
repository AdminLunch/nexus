// NEXUS — zelftest voor de ECHTE Claude-artifact-omgeving.
// Alleen in de testverpakking (node tools/build-artifact.mjs --selftest). Niet in de app of de PWA.
// Open de pagina met #zelftest en tik op "Start". Gebruikt uitsluitend fictieve gegevens:
// de bestaande lokale NEXUS-gegevens worden vooraf bewaard en na afloop exact teruggezet.
// Resultaten (alleen namen van controles, geslaagd/niet, korte technische details — nooit
// persoonlijke gegevens) komen op het scherm en in de database van dít test-artifact (selftest/<id>).
import * as store from './store.js';
import * as consent from './privacy/consent.js';
import { getProviders } from './ai/engine.js';

const CLAUDE_AT_LOAD = typeof window.claude === 'object' && !!window.claude && typeof window.claude.use === 'function';
const KEYS = ['nexus.v1', 'nexus.v1.restore', 'nexus.bodyTab'];
const RESULT_KEY = 'nexus.selftest.results';
const MARK_KEY = 'nexus.selftest.marker';
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.message || e.error || 'fout')));
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message || e.reason || 'promise')));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const useCap = (name, ms = 12000) => Promise.race([
  window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null),
  wait(ms).then(() => null),
]);

function panel() {
  let el = document.getElementById('selftest');
  if (!el) {
    el = document.createElement('div');
    el.id = 'selftest';
    el.setAttribute('role', 'dialog');
    el.style.cssText = 'position:fixed;inset:0;z-index:200;overflow:auto;background:#05060f;color:#e8eaff;padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px);font:14px/1.45 -apple-system,system-ui,sans-serif';
    document.body.append(el);
  }
  return el;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(results, note = '') {
  const el = panel();
  const ok = results.filter((r) => r.status === 'ok').length;
  const color = { ok: '#3ee6c1', fout: '#ff5d7a', let_op: '#ffb54d', handmatig: '#9096c4' };
  el.innerHTML = `
    <h2 style="margin:0 0 4px">NEXUS zelftest — echte Claude-omgeving</h2>
    <p style="margin:0 0 12px;color:#9096c4">Alleen fictieve gegevens. Je eigen NEXUS-gegevens in deze browser worden na afloop teruggezet.</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <button id="st-run" style="padding:10px 14px;border-radius:10px;border:0;background:#7c8cff;color:#05061a;font-weight:700">Start automatische zelftest</button>
      <button id="st-ai" style="padding:10px 14px;border-radius:10px;border:1px solid #333a70;background:#12152b;color:inherit">Test Claude-AI (1 fictieve vraag)</button>
      <button id="st-dl" style="padding:10px 14px;border-radius:10px;border:1px solid #333a70;background:#12152b;color:inherit">Test download</button>
      <button id="st-copy" style="padding:10px 14px;border-radius:10px;border:1px solid #333a70;background:#12152b;color:inherit">Kopieer resultaten</button>
      <a href="#home" style="padding:10px 14px;color:#9096c4">Sluiten</a>
    </div>
    ${note ? `<p style="color:#ffb54d">${esc(note)}</p>` : ''}
    ${results.length ? `<p><b>${ok}/${results.length}</b> geslaagd</p>` : ''}
    <ol style="padding-left:20px">${results.map((r) => `<li style="margin:4px 0"><b style="color:${color[r.status] || '#fff'}">${esc(r.status.toUpperCase())}</b> ${esc(r.name)}${r.detail ? `<br><small style="color:#9096c4">${esc(r.detail)}</small>` : ''}</li>`).join('')}</ol>`;
  el.querySelector('#st-run').onclick = () => runAll();
  el.querySelector('#st-ai').onclick = () => runAiTest();
  el.querySelector('#st-dl').onclick = () => runDownloadTest();
  el.querySelector('#st-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(results, null, 1)); el.querySelector('#st-copy').textContent = 'Gekopieerd'; } catch (_) { el.querySelector('#st-copy').textContent = 'Kopiëren lukte niet'; }
  };
}

const loadResults = () => { try { return JSON.parse(sessionStorage.getItem(RESULT_KEY) || '[]'); } catch (_) { return []; } };
const keepResults = (r) => { try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch (_) { /* */ } };

async function saveToDb(results, kind) {
  try {
    const db = await useCap('db', 8000);
    if (!db) return 'database niet beschikbaar';
    const id = `run-${Date.now().toString(36)}`;
    await db.doc(`selftest/${id}`).set({ kind, at: new Date().toISOString(), ua: uaKind(), results: results.map((r) => ({ name: r.name, status: r.status, detail: String(r.detail || '').slice(0, 300) })) });
    return `opgeslagen als selftest/${id}`;
  } catch (e) { return `database: ${e?.code || e?.message || 'fout'}`; }
}
function uaKind() {
  const ua = navigator.userAgent;
  return `${/iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'desktop'} · ${/CriOS|Chrome/.test(ua) ? 'Chromium' : /Safari/.test(ua) ? 'Safari/WebKit' : 'anders'} · ${window.innerWidth}×${window.innerHeight}`;
}

// Fictieve gegevens in de vorm van het oude artifact (schema 2).
const ARTIFACT_V12 = {
  schema: 2, createdAt: '2026-10-01', updatedAt: 1, settings: { name: 'Fictief', aiProvider: 'claude', waterTarget: 7 },
  moods: { '2026-10-02': { focus: 3 } },
  meals: { '2026-10-02': [{ id: 'm1', slot: 'avond', time: '18:30', text: 'Fictieve maaltijd', tags: ['eiwit'] }, { id: 'm2', slot: 'lunch', skipped: true, time: '13:00' }] },
  mealPlan: { '2026-10-04': { avond: 'Fictief plan' } }, thoughts: [{ id: 't1', date: '2026-10-02', t: 1, kind: 'idee', text: 'Fictief' }],
};

async function runAll() {
  const R = [];
  const add = (name, cond, detail = '', warn = false) => R.push({ name, status: cond ? 'ok' : warn ? 'let_op' : 'fout', detail });
  render([], 'Bezig… dit duurt ongeveer 20 seconden.');
  const snapshot = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
  const prevErrors = errors.length;
  try {
    // --- Runtime ---
    add('window.claude aanwezig bij laden', CLAUDE_AT_LOAD, CLAUDE_AT_LOAD ? '' : 'pas later beschikbaar; app wacht hierop', true);
    const caps = {};
    for (const c of ['sample', 'db', 'user', 'downloads']) caps[c] = !!(await useCap(c));
    add('Capabilities beschikbaar (sample, db, user, downloads)', Object.values(caps).every(Boolean), JSON.stringify(caps));
    add('Omgeving', true, uaKind());

    // --- Opslag ---
    let lsOk = false, prevMark = null;
    try { prevMark = localStorage.getItem(MARK_KEY); localStorage.setItem(MARK_KEY, new Date().toISOString()); lsOk = localStorage.getItem(MARK_KEY) != null; } catch (_) { /* */ }
    add('localStorage beschikbaar', lsOk);
    add('localStorage blijft bewaard tussen bezoeken', !!prevMark, prevMark ? `vorige zelftest: ${prevMark}` : 'eerste keer — voer de zelftest later nog eens uit (ook na herladen)', true);

    // --- Beveiliging ---
    add('Geen eigen CSP-meta in artifact (claude.ai-CSP geldt)', !document.querySelector('meta[http-equiv="Content-Security-Policy"]'));
    const inline = (() => { const sc = document.createElement('script'); sc.textContent = 'window.__nexusInline = 1'; document.head.append(sc); sc.remove(); return window.__nexusInline === 1; })();
    add('Ingevoegd inline script wordt geblokkeerd', !inline, inline ? 'claude.ai staat inline scripts toe: XSS-bescherming rust volledig op esc()/safeHtml()/typecontrole' : 'geblokkeerd', true);
    let fetchBlocked = false;
    try { await Promise.race([fetch('https://example.com/', { mode: 'no-cors' }), wait(5000).then(() => { throw new Error('timeout'); })]); } catch (_) { fetchBlocked = true; }
    add('Verbinding naar externe server geblokkeerd', fetchBlocked);

    // --- Gegevensbehoud / migratie (puur) ---
    const m = store.migrateForTest(structuredClone(ARTIFACT_V12));
    add('Migratie oud artifact-formaat → schema 3', m.schema === 3 && m.meals['2026-10-02'][0].slot === 'diner' && m.meals['2026-10-02'][0].name === 'Fictieve maaltijd' && m.meals['2026-10-02'][1].skipped === true && m.mealPlan['2026-10-04'].diner === 'Fictief plan' && JSON.stringify(m.moods['2026-10-02']) === '{"focus":3}' && m.thoughts.length === 1);
    add('Migratie zet sync uit en geeft geen AI-toestemming', m.settings.cloudSync === false && Object.keys(m.privacy.ai.scopes).length === 0);

    // --- Synchronisatie ---
    add('Synchroniseren staat uit', store.getState().settings.cloudSync === false);
    try {
      const db = await useCap('db'); const user = await useCap('user');
      const id = db && user ? await user.id() : null;
      const snap = id ? await db.collection('data/users/' + id).doc('nexus').get() : null;
      const exists = snap ? (typeof snap.exists === 'function' ? snap.exists() : snap.exists) !== false && (typeof snap.data === 'function' ? !!snap.data() : !!snap.data) : false;
      add('Geen kopie van NEXUS-gegevens in Claude-opslag', !exists, id ? '' : 'niet ingelogd of db niet beschikbaar');
    } catch (e) { add('Geen kopie van NEXUS-gegevens in Claude-opslag', false, e?.code || e?.message || 'fout', true); }

    // --- Toestemming (op fictieve testgegevens) ---
    store.loadDemo();
    store.update((st) => { st.settings.aiProvider = 'claude'; st.privacy.ai = { textVersion: null, host: '', scopes: {}, decidedAt: null, updatedAt: null }; st.privacy.aiLog = []; });
    add('Claude-bestemming is claude.ai', consent.activeHost() === consent.CLAUDE_HOST);
    add('Standaard geen toestemming voor Claude', !consent.hasDecided(consent.CLAUDE_HOST));
    const claude = getProviders().find((p) => p.id === 'claude');
    const before = store.getState().privacy.aiLog.length;
    const out = await claude.reply('Fictieve vraag', []);
    add('Zonder toestemming: niets verstuurd', /niets verstuurd/.test(out) && store.getState().privacy.aiLog.length === before);
    const req0 = JSON.stringify(consent.buildAiRequest('Fictieve vraag', [], consent.grantedScopes(consent.CLAUDE_HOST)).messages);
    add('Zonder categorieën alleen het bericht', req0.includes('deelt geen persoonlijke gegevens') && !req0.includes('stemming_1_5'));
    consent.setConsent(Object.fromEntries(consent.CATEGORY_IDS.map((c) => [c, true])), consent.CLAUDE_HOST);
    const reqAll = JSON.stringify(consent.buildAiRequest('Fictieve vraag', store.getState().chat, consent.grantedScopes(consent.CLAUDE_HOST)).messages);
    const st = store.getState();
    const secretMeal = Object.values(st.meals).flat().find((x) => x.name)?.name || '###';
    add('Met alles aan: nooit reflecties, gedachten, maaltijdnamen', !reqAll.includes('Goede focus vandaag') && !reqAll.includes(secretMeal) && !st.thoughts.some((t) => reqAll.includes(t.text)));
    consent.revokeAll(consent.CLAUDE_HOST);
    add('Toestemming intrekken zet alles uit', Object.values(consent.grantedScopes(consent.CLAUDE_HOST)).every((v) => !v) && consent.hasDecided(consent.CLAUDE_HOST));

    // --- Schermen en navigatie ---
    const routes = ['home', 'mind', 'body', 'goals', 'ai'];
    const bad = [];
    for (const r of routes) {
      location.hash = r; await wait(450);
      if ((document.getElementById('view')?.innerText || '').trim().length < 20) bad.push(r);
      if (r === 'body') for (const sub of ['voeding', 'inzichten', 'kennis', 'herstel']) { document.querySelector(`[data-sub="${sub}"]`)?.click(); await wait(350); if (!document.getElementById('body-sub')?.innerText.trim()) bad.push('body/' + sub); }
    }
    add('Alle schermen en Body-onderdelen tonen inhoud', !bad.length, bad.join(', '));
    add('Geen horizontale scroll (mobiel)', document.documentElement.scrollWidth <= window.innerWidth + 1, `${document.documentElement.scrollWidth} / ${window.innerWidth}`);
    const tb = document.querySelector('.tabbar')?.getBoundingClientRect();
    add('Tabbalk zichtbaar onderaan', !!tb && tb.bottom <= window.innerHeight + 1 && tb.height > 30);

    // --- XSS via gemanipuleerde (fictieve) back-up ---
    const evil = '"><img src=x onerror="window.__nexusXss=1">';
    const day = store.today();
    store.importJSON({ app: 'NEXUS', data: { settings: { name: evil }, priorities: { [day]: [{ id: evil, text: evil }] }, habits: [{ id: evil, name: evil, icon: evil }],
      meals: { [day]: [{ id: evil, name: evil, slot: evil, tags: [evil] }] }, thoughts: [{ id: evil, date: day, kind: evil, text: evil }], mealPlan: { [day]: { ontbijt: evil } },
      goals: [{ id: evil, title: evil, milestones: [{ id: evil, text: evil }] }], chat: [{ role: 'bot', text: `<b>vet</b>${evil}<script>window.__nexusXss=1</script>`, t: 1 }] } });
    for (const r of routes) { location.hash = r; await wait(400); if (r === 'body') for (const sub of ['voeding', 'herstel']) { document.querySelector(`[data-sub="${sub}"]`)?.click(); await wait(250); } }
    add('Gemanipuleerde back-up voert geen code uit', window.__nexusXss !== 1 && !document.querySelector('img[src="x"]'));

    add('Geen JavaScript-fouten tijdens de test', errors.length === prevErrors, errors.slice(prevErrors).join(' | '));
  } catch (e) {
    add('Zelftest liep zonder onverwachte fout', false, e?.message || String(e));
  } finally {
    for (const [k, v] of Object.entries(snapshot)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }
  R.push({ name: 'Database-opslag van resultaten', status: 'handmatig', detail: await saveToDb(R, 'auto') });
  keepResults(R);
  // Herladen zodat de app de teruggezette eigen gegevens gebruikt.
  location.hash = 'zelftest';
  location.reload();
}

async function runAiTest() {
  const R = loadResults();
  const snapshot = Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
  try {
    store.update((st) => { st.settings.aiProvider = 'claude'; });
    consent.setConsent({}, consent.CLAUDE_HOST); // "niets delen, alleen mijn bericht"
    const claude = getProviders().find((p) => p.id === 'claude');
    const before = store.getState().privacy.aiLog.length;
    const t0 = Date.now();
    const out = await claude.reply('Dit is een fictieve testvraag. Antwoord alleen met het woord OK.', []);
    const log = store.getState().privacy.aiLog;
    R.push({ name: 'Claude-AI antwoordt (na toestemming "niets delen")', status: out && !/niets verstuurd/.test(out) ? 'ok' : 'fout', detail: `${Date.now() - t0} ms · antwoord: ${String(out).replace(/<[^>]+>/g, '').slice(0, 60)}` });
    R.push({ name: 'Logboek: claude.ai, geen categorieën, geen inhoud', status: log.length === before + 1 && log[0].host === 'claude.ai' && log[0].categories.length === 0 && !JSON.stringify(log).includes('fictieve testvraag') ? 'ok' : 'fout' });
  } catch (e) {
    R.push({ name: 'Claude-AI antwoordt', status: 'fout', detail: e?.code || e?.message || String(e) });
  } finally {
    for (const [k, v] of Object.entries(snapshot)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }
  R.push({ name: 'Database-opslag (AI-test)', status: 'handmatig', detail: await saveToDb(R.slice(-3), 'ai') });
  keepResults(R);
  location.reload();
}

async function runDownloadTest() {
  const R = loadResults();
  try {
    const dl = await useCap('downloads');
    if (!dl) throw new Error('downloads niet beschikbaar');
    await dl.save({ filename: 'nexus-zelftest-fictief.txt', data: 'NEXUS zelftest — fictieve inhoud.' });
    R.push({ name: 'Download via Claude (bevestigd door gebruiker)', status: 'ok' });
  } catch (e) {
    R.push({ name: 'Download via Claude', status: 'fout', detail: e?.code || e?.message || String(e) });
  }
  R.push({ name: 'Database-opslag (downloadtest)', status: 'handmatig', detail: await saveToDb(R.slice(-1), 'download') });
  keepResults(R);
  render(R);
}

function route() { if (location.hash === '#zelftest') render(loadResults()); else document.getElementById('selftest')?.remove(); }
window.addEventListener('hashchange', route);
setTimeout(route, 300);
