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

// ---------- samenvatting ----------
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
