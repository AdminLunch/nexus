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

// ---------- samenvatting ----------
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
