// Unit-tests voor NEXUS — draaien in Node zonder browser: `node tests/unit.mjs`.
// Gebruikt alleen synthetische testgegevens.
import assert from 'node:assert/strict';

// ---------- minimale browseromgeving ----------
class MemoryStorage {
  constructor() { this.m = new Map(); this.quota = Infinity; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    const size = [...this.m.entries()].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0) + String(v).length;
    if (size > this.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
globalThis.localStorage = new MemoryStorage();

const store = await import('../js/store.js');

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); console.log(`✅ ${name}`); }
  catch (e) { results.push([name, false]); console.log(`❌ ${name}\n   ${e.stack?.split('\n').slice(0, 3).join('\n   ')}`); }
}
const fresh = (data) => { localStorage.clear(); if (data) localStorage.setItem('nexus.v1', JSON.stringify(data)); return store.load(); };

// ---------- opslag & migratie ----------
await test('Lege start geeft standaardstaat', () => {
  const s = fresh();
  assert.equal(s.schema, 1);
  assert.deepEqual(s.priorities, {});
  assert.ok(Array.isArray(s.habits) && s.habits.length === 4);
});

await test('Bestaande gegevens blijven bij laden behouden (v1.2-vorm)', () => {
  const old = { schema: 1, createdAt: '2026-01-01', settings: { name: 'Test', sleepTarget: 7.5, weeklyTrainingTarget: 120, aiProvider: 'local', aiEndpoint: '', aiModel: '', aiKey: '' },
    priorities: { '2026-01-02': [{ id: 'p1', text: 'Taak', done: true }] }, moods: { '2026-01-02': { mood: 4, energy: 7 } },
    reflections: { '2026-01-02': 'Synthetische reflectie' }, habits: [{ id: 'h1', name: 'Lezen', icon: '📖' }], habitLog: { '2026-01-02': ['h1'] },
    sleep: { '2026-01-02': { hours: 7.25, quality: 4 } }, workouts: [{ id: 'w1', date: '2026-01-02', type: 'Kracht', minutes: 45, intensity: 3 }],
    health: { '2026-01-02': { steps: 8000, rhr: 55, hrv: 60 } }, healthImportedAt: null, goals: [], chat: [] };
  const s = fresh(old);
  for (const k of Object.keys(old)) if (k !== 'settings') assert.deepEqual(s[k], old[k], k);
  assert.equal(s.settings.name, 'Test');
  assert.equal(s.settings.kcalTarget, 2200, 'nieuwe instelling krijgt standaardwaarde');
  assert.deepEqual(s.meals, {});
});

await test('Onbekende velden blijven bewaard (vooruit-compatibel)', () => {
  const s = fresh({ settings: {}, toekomstigVeld: { a: 1 } });
  assert.deepEqual(s.toekomstigVeld, { a: 1 });
});

await test('Demo-data is consistent en behoudt instellingen', () => {
  fresh({ settings: { name: 'Demo' } });
  store.loadDemo();
  const s = store.getState();
  assert.equal(s.settings.name, 'Demo');
  assert.ok(s.workouts.length > 10);
  assert.ok(Object.keys(s.meals).length > 20);
});


// ---------- typecontrole (XSS-bescherming) ----------
const { normalizeState, safeId } = await import('../js/schema.js');

await test('Typecontrole laat geldige gegevens exact gelijk (demo-data)', () => {
  fresh({ settings: { name: 'Demo' } });
  store.loadDemo();
  const s = structuredClone(store.getState());
  s.chat = [{ role: 'user', text: 'samenvatting', t: 1 }, { role: 'bot', text: '<b>Dagscore 50</b> — test', t: 2 }];
  s.goals[0].milestones[0].done = true;
  assert.deepEqual(normalizeState(s, store.defaults()), s);
});

await test('Typecontrole maakt gemanipuleerde waarden onschadelijk', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const s = normalizeState({
    settings: { sleepTarget: evil, name: 42 },
    moods: { '2026-01-01': { mood: evil, energy: '7' }, '2026-01-02': { mood: 99, energy: -3 } },
    habits: [{ id: evil, name: 'X', icon: '💧' }], habitLog: { '2026-01-01': [evil] },
    meals: { '2026-01-01': [{ id: 'm1', name: 'Appel', slot: evil, kcal: evil, protein: '12,5' }] },
    workouts: [{ id: 'w1', date: '2026-01-01', type: 'Kracht', minutes: evil, intensity: evil }, 'geen object'],
    health: { '2026-01-01': { steps: evil, rhr: '55' } },
    water: { '2026-01-01': evil },
    goals: [{ id: evil, title: 'Doel', milestones: [{ id: evil, text: 1, done: 'ja' }] }],
    chat: [{ role: evil, text: '<script>x</script>' }],
  }, store.defaults());
  assert.equal(s.settings.sleepTarget, 8);
  assert.equal(s.settings.name, '42');
  assert.deepEqual(s.moods['2026-01-01'], { mood: 3, energy: 7 });
  assert.deepEqual(s.moods['2026-01-02'], { mood: 5, energy: 0 });
  assert.match(s.habits[0].id, /^x[0-9a-z]+$/);
  assert.equal(s.habitLog['2026-01-01'][0], s.habits[0].id, 'verwijzing blijft kloppen');
  assert.deepEqual([s.meals['2026-01-01'][0].slot, s.meals['2026-01-01'][0].kcal, s.meals['2026-01-01'][0].protein], ['snack', 0, 12.5]);
  assert.equal(s.workouts.length, 1);
  assert.equal(s.workouts[0].minutes, 0);
  assert.deepEqual(s.health['2026-01-01'], { rhr: 55 });
  assert.equal(s.water['2026-01-01'], undefined);
  assert.equal(s.goals[0].milestones[0].done, false);
  assert.equal(s.chat[0].role, 'bot');
  assert.ok(!JSON.stringify([s.habits, s.goals, s.meals, s.moods, s.workouts]).includes('<img'));
});

await test('safeId laat normale id\'s ongemoeid', () => {
  for (const id of ['h-water', 'mwje7e73iu9qr', 'a_b-1']) assert.equal(safeId(id), id);
  assert.notEqual(safeId('a"b'), 'a"b');
  assert.equal(safeId('a"b'), safeId('a"b'));
});


// ---------- back-ups ----------
const crypto2 = await import('../js/crypto.js');

await test('Export bevat standaard geen API-sleutel', () => {
  fresh({ settings: { aiKey: 'testsleutel-xyz' } });
  assert.ok(!store.exportJSON().includes('testsleutel-xyz'));
  assert.ok(store.exportJSON({ includeKey: true }).includes('testsleutel-xyz'));
});

await test('Import zonder sleutel behoudt de sleutel op het toestel', () => {
  fresh({ settings: { aiKey: 'testsleutel-xyz' } });
  const backup = JSON.parse(store.exportJSON());
  store.importJSON(backup);
  assert.equal(store.getState().settings.aiKey, 'testsleutel-xyz');
});

await test('Import weigert ongeldige bestanden', () => {
  fresh();
  assert.throws(() => store.importJSON('geen json'), /geen JSON/);
  assert.throws(() => store.importJSON('[1,2]'), /Geen geldig/);
  assert.throws(() => store.importJSON('x'.repeat(store.MAX_BACKUP_BYTES + 1)), /te groot/);
});

await test('Versleutelen en ontsleutelen (AES-GCM, PBKDF2)', async () => {
  const plain = JSON.stringify({ geheim: 'synthetische reflectie' });
  const packed = await crypto2.encryptText(plain, 'correct-paard-batterij');
  const raw = JSON.stringify(packed);
  assert.ok(!raw.includes('synthetische'));
  assert.equal(packed.kdf.iterations, crypto2.PBKDF2_ITERATIONS);
  assert.ok(crypto2.isEncryptedBackup(packed));
  assert.equal(await crypto2.decryptText(packed, 'correct-paard-batterij'), plain);
  await assert.rejects(crypto2.decryptText(packed, 'fout-wachtwoord'), /onjuist/);
  const tampered = { ...packed, data: packed.data.slice(0, -4) + 'AAAA' };
  await assert.rejects(crypto2.decryptText(tampered, 'correct-paard-batterij'), /onjuist|beschadigd/);
  await assert.rejects(crypto2.encryptText(plain, 'kort'), /minstens/);
  const weak = { ...packed, kdf: { ...packed.kdf, iterations: 10 } };
  await assert.rejects(crypto2.decryptText(weak, 'correct-paard-batterij'), /onveilig/);
});


// ---------- herstelpunten ----------
await test('Herstelpunt maken en terugzetten', () => {
  fresh({ settings: { name: 'Origineel' }, goals: [{ id: 'g1', title: 'Doel', milestones: [] }] });
  const id = store.createRestorePoint('Vóór test');
  assert.ok(id);
  store.resetAll();
  assert.equal(store.getState().goals.length, 0);
  store.restoreFrom(id);
  assert.equal(store.getState().goals[0].title, 'Doel');
  assert.equal(store.getState().settings.name, 'Origineel');
  assert.equal(store.restorePoints()[0].reason, 'Vóór terugzetten herstelpunt', 'terugzetten maakt zelf ook een herstelpunt');
});

await test('Maximaal 3 herstelpunten, nieuwste eerst', () => {
  fresh();
  for (let i = 1; i <= 5; i++) store.createRestorePoint(`punt ${i}`);
  assert.deepEqual(store.restorePoints().map((p) => p.reason), ['punt 5', 'punt 4', 'punt 3']);
  assert.ok(!store.exportJSON().includes('punt 5'), 'herstelpunten gaan niet mee in back-up');
});

await test('Volle opslag: actuele gegevens gaan vóór herstelpunten', () => {
  fresh({ settings: {}, reflections: { '2026-01-01': 'a'.repeat(2000) } });
  store.createRestorePoint('p1'); store.createRestorePoint('p2');
  localStorage.quota = JSON.stringify(store.getState()).length * 2 + 3000;
  store.update((st) => { st.reflections['2026-01-02'] = 'b'.repeat(1500); });
  assert.ok(store.isStorageOk(), 'opslaan lukt door herstelpunten op te ruimen');
  assert.ok(JSON.parse(localStorage.getItem('nexus.v1')).reflections['2026-01-02']);
  assert.ok(store.restorePoints().length < 2);
  assert.equal(store.createRestorePoint('past niet meer'), null, 'geen herstelpunt als er geen ruimte is');
  localStorage.quota = Infinity;
});


// ---------- import Apple Gezondheid ----------
const health = await import('../js/health.js');

await test('Gezondheidsimport leest geldige regels', () => {
  const d = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const day = store.dateKey(new Date(Date.now() - 24 * 3600e3));
  const r = health.parseHealthText(['NEXUS-HEALTH', `STP|${day}|8432`, `RHR|${day}|55`, `HRV|${day}|61`, `WRK|${d(30)}|${d(29)}|Running|45`].join('\n'));
  assert.equal(r.count, 4);
  assert.deepEqual(r.days[day], { steps: 8432, rhr: 55, hrv: 61 });
  assert.equal(r.workouts[0].type, 'Hardlopen');
});

await test('Gezondheidsimport slaat onzin en extreme waarden over', () => {
  const day = store.dateKey(new Date(Date.now() - 24 * 3600e3));
  const old = '2001-01-01';
  const r = health.parseHealthText(['NEXUS-HEALTH', `STP|${day}|9999999`, `RHR|${day}|5`, `HRV|${old}|50`,
    `SLP|${new Date(Date.now() - 50 * 3600e3).toISOString()}|${new Date(Date.now() - 1 * 3600e3).toISOString()}|Kern`,
    `WRK|${new Date().toISOString()}||Running|5000`, 'XYZ|<img src=x>|1'].join('\n'));
  assert.equal(r.count, 0);
  assert.deepEqual(r.days, {});
  assert.deepEqual(r.sleep, {});
});

await test('Gezondheidsimport weigert te grote invoer en tekst zonder kop', () => {
  assert.throws(() => health.parseHealthText('willekeurige klembordtekst'), /Geen gegevens/);
  assert.throws(() => health.parseHealthText('NEXUS-HEALTH\n' + 'x'.repeat(health.MAX_IMPORT_CHARS)), /te groot/);
});


// ---------- AI-toestemming ----------
const consent = await import('../js/privacy/consent.js');
const engine = await import('../js/ai/engine.js');
const ENDPOINT = 'https://ai.example.test/v1';
const HOST = 'ai.example.test';

function privacyFixture() {
  fresh({ settings: { name: 'Testnaam' } });
  store.loadDemo();
  const t = store.today();
  store.update((st) => {
    st.settings.aiProvider = 'openai-compatible'; st.settings.aiEndpoint = ENDPOINT; st.settings.aiModel = 'testmodel';
    st.settings.aiKey = 'testsleutel-geheim';
    st.reflections[t] = 'GEHEIM-REFLECTIE';
    (st.meals[t] ||= []).push({ id: 'mx', name: 'GEHEIM-MAALTIJD', slot: 'lunch', kcal: 500, protein: 20, carbs: 50, fat: 10 });
    st.health[t] = { steps: 12345, rhr: 51, hrv: 77 };
    st.nieuwVeldInDeToekomst = 'NIEUW-VELD';
    st.chat = [{ role: 'user', text: 'EERDERE-VRAAG', t: 1 }, { role: 'bot', text: '<b>EERDER-ANTWOORD</b>', t: 2 }];
  });
}
const all = () => Object.fromEntries(consent.CATEGORY_IDS.map((id) => [id, true]));
const reqText = (scopes) => JSON.stringify(consent.buildAiRequest('Mijn vraag', store.getState().chat, scopes).messages);

await test('AI: standaard geen toestemming en geen gegevens', () => {
  privacyFixture();
  assert.equal(consent.hasDecided(HOST), false);
  assert.deepEqual(Object.values(consent.grantedScopes(HOST)).filter(Boolean), []);
  const txt = reqText(consent.grantedScopes(HOST));
  for (const secret of ['Testnaam', 'Halve', '12345', 'EERDERE-VRAAG', 'GEHEIM-REFLECTIE', 'testsleutel-geheim', 'stemming_1_5']) assert.ok(!txt.includes(secret), secret);
  assert.ok(txt.includes('deelt geen persoonlijke gegevens'));
  assert.ok(txt.includes('Mijn vraag'));
});

await test('AI: per categorie alleen de bijbehorende velden', () => {
  privacyFixture();
  const only = (id) => reqText({ ...consent.emptyScopes(), [id]: true });
  assert.ok(only('mood').includes('stemming_1_5') && !only('mood').includes('doelen') && !only('mood').includes('slaapEnGezondheid'));
  assert.ok(only('goals').includes('doelen') && !only('goals').includes('stemming'));
  assert.ok(only('sleepHealth').includes('slaapEnGezondheid') && !only('sleepHealth').includes('voeding'));
  assert.ok(only('profile').includes('Testnaam') && !only('mood').includes('Testnaam'));
  assert.ok(only('history').includes('EERDERE-VRAAG') && !only('mood').includes('EERDERE-VRAAG'));
  assert.ok(!only('history').includes('<b>'), 'geen HTML naar het model');
});

await test('AI: dit gaat nooit mee, ook niet met alles aan', () => {
  privacyFixture();
  const txt = reqText(all());
  for (const secret of ['GEHEIM-REFLECTIE', 'GEHEIM-MAALTIJD', 'NIEUW-VELD', 'testsleutel-geheim', 'aiEndpoint']) assert.ok(!txt.includes(secret), secret);
  assert.ok(!txt.includes(`"${store.today()}":{"steps"`), 'geen gezondheidswaarden per dag');
  assert.ok(txt.includes('rusthartslag'), 'wel gemiddelden');
});

await test('AI: toestemming hoort bij één server en één versie van de uitleg', () => {
  privacyFixture();
  consent.setConsent({ mood: true }, HOST);
  assert.equal(consent.hasDecided(HOST), true);
  assert.equal(consent.grantedScopes(HOST).mood, true);
  assert.equal(consent.hasDecided('andere.example.test'), false);
  assert.equal(consent.grantedScopes('andere.example.test').mood, false);
  store.update((st) => { st.privacy.ai.textVersion = 'oude-versie'; });
  assert.equal(consent.hasDecided(HOST), false, 'nieuwe uitleg → opnieuw vragen');
  consent.setConsent({ mood: true }, HOST);
  consent.revokeAll(HOST);
  assert.equal(consent.grantedScopes(HOST).mood, false, 'intrekken werkt direct');
});

await test('AI-provider verstuurt niets zonder keuze, daarna alleen het toegestane', async () => {
  privacyFixture();
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ choices: [{ message: { content: 'Antwoord <img src=x>' } }] }) }; };
  const p = engine.getProviders().find((x) => x.id === 'openai-compatible');
  assert.equal(p.external, true);
  const r1 = await p.reply('Hoe gaat het?', store.getState().chat);
  assert.equal(calls.length, 0, 'zonder keuze geen netwerkverkeer');
  assert.match(r1, /niets verstuurd/);
  consent.setConsent({ mood: true }, HOST);
  const r2 = await p.reply('Hoe gaat het?', store.getState().chat);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].opts.body);
  const sent = JSON.stringify(body);
  assert.ok(sent.includes('stemming_1_5') && !sent.includes('doelen') && !sent.includes('EERDERE-VRAAG') && !sent.includes('testsleutel-geheim'));
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer testsleutel-geheim', 'sleutel alleen in de header');
  assert.ok(!r2.includes('<img'), 'antwoord wordt ontsmet');
  const log = store.getState().privacy.aiLog;
  assert.deepEqual(log[0].categories, ['mood']);
  assert.equal(log[0].host, HOST);
  assert.ok(!JSON.stringify(log).includes('Hoe gaat het'), 'logboek zonder inhoud');
  delete globalThis.fetch;
});

await test('Toestemming overleeft back-up en typecontrole', () => {
  privacyFixture();
  consent.setConsent({ mood: true, goals: true }, HOST);
  const back = JSON.parse(store.exportJSON());
  store.resetAll();
  assert.equal(consent.hasDecided(HOST), false);
  store.importJSON(back);
  assert.equal(consent.grantedScopes(HOST).goals, true);
  const weird = store.defaults(); weird.privacy = { ai: { textVersion: consent.CONSENT_TEXT_VERSION, host: HOST, scopes: { mood: 'ja', goals: 1 } } };
  store.importJSON({ data: weird });
  assert.deepEqual(Object.values(consent.grantedScopes(HOST)).filter(Boolean), [], 'alleen echte true telt');
});

// ---------- samenvatting ----------
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
