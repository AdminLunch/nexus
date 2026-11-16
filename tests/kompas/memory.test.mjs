import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/kompas/memory.js';
import { T0, day, seqIds } from './fixtures.mjs';

const fresh = () => ({ m: M.createMemory({ now: T0 }), idGen: seqIds() });

test('vijf lagen worden gescheiden bijgehouden', () => {
  let { m, idGen } = fresh();
  m = M.addTold(m, 'Ik werk in ploegendienst', { now: T0, idGen, topics: ['werk'] });
  m = M.addValue(m, 'Eerlijkheid', { now: T0, idGen });
  m = M.addInterest(m, 'Vogels tekenen', { now: T0, idGen });
  m = M.addPossible(m, 'Misschien hangen slapen en diensten samen', { now: T0, idGen, alternatives: ['Of de buren'] });
  m = M.addOwnInsight(m, 'Ik heb ochtenden nodig om op te starten', { now: T0, idGen });
  const L = M.layers(m);
  assert.equal(L.told.length, 1);
  assert.equal(L.value.length, 1);
  assert.equal(L.interest.length, 1);
  assert.equal(L.possible.length, 1);
  assert.equal(L.insight.length, 1);
  assert.equal(L.archive.length, 0);
  assert.deepEqual(M.validate(m), []);
});

test('functies muteren het origineel niet', () => {
  const { m, idGen } = fresh();
  const m2 = M.addTold(m, 'Iets', { now: T0, idGen });
  assert.equal(m.entries.length, 0);
  assert.equal(m2.entries.length, 1);
});

test('een mogelijk verband is nooit een feit en heeft altijd een alternatief', () => {
  let { m, idGen } = fresh();
  m = M.addPossible(m, 'Misschien is X verbonden met Y', { now: T0, idGen });
  const e = m.entries[0];
  assert.equal(e.origin, 'nexus');
  assert.equal(e.type, 'possible');
  assert.equal(M.isFact(e), false);
  assert.ok(e.alternatives.length >= 1, 'standaard-alternatief toegevoegd');
  assert.equal(e.lastConfirmedAt, null);
});

test('alleen de gebruiker kan bevestigen; NEXUS niet', () => {
  let { m, idGen } = fresh();
  m = M.addPossible(m, 'Misschien is X verbonden met Y', { now: T0, idGen });
  const id = m.entries[0].id;
  assert.throws(() => M.confirm(m, id, { by: 'nexus', now: T0 }), /alleen de gebruiker/);
  assert.throws(() => M.confirm(m, id, { now: T0 }), /alleen de gebruiker/);
  const c = M.confirm(m, id, { by: 'user', now: day(1), text: 'X en Y hangen voor mij samen' });
  assert.equal(c.entries[0].type, 'insight');
  assert.equal(c.entries[0].text, 'X en Y hangen voor mij samen');
  assert.equal(c.entries[0].lastConfirmedAt, day(1));
  assert.ok(c.entries[0].history.some((h) => h.action === 'confirmed' && h.by === 'user'));
});

test('corrigeren archiveert, bewaart de eigen woorden en onderdrukt herhaling', () => {
  let { m, idGen } = fresh();
  m = M.addPossible(m, 'Misschien vermijd je vergaderingen door onzekerheid', { now: T0, idGen, topics: ['werk'] });
  const id = m.entries[0].id;
  m = M.correct(m, id, { by: 'user', correction: 'Vergaderingen zijn gewoon te lang', now: day(1), idGen });
  const L = M.layers(m);
  assert.equal(L.archive[0].status, 'corrected');
  assert.equal(L.told[0].text, 'Vergaderingen zijn gewoon te lang');
  assert.deepEqual(L.told[0].topics, ['werk']);
  assert.equal(M.isSuppressed(m, 'Misschien vermijd je vergaderingen door onzekerheid', { now: day(2) }), true);
  assert.throws(() => M.addPossible(m, 'misschien vermijd je VERGADERINGEN door onzekerheid!', { now: day(3), idGen }), /eerder afgewezen/);
  // Een echt ander verband mag wel.
  assert.doesNotThrow(() => M.addPossible(m, 'Misschien kost het reizen veel energie', { now: day(3), idGen }));
});

test('verwijderen wist de inhoud echt; purge verwijdert alles', () => {
  let { m, idGen } = fresh();
  m = M.addTold(m, 'Gevoelig synthetisch detail', { now: T0, idGen, topics: ['relaties'] });
  const id = m.entries[0].id;
  m = M.remove(m, id, { by: 'user', now: day(1) });
  const tomb = m.entries[0];
  assert.equal(tomb.status, 'deleted');
  assert.equal('text' in tomb, false);
  assert.equal('topics' in tomb, false);
  assert.equal('history' in tomb, false);
  assert.ok(!JSON.stringify(m).includes('Gevoelig'));
  assert.throws(() => M.restore(m, id, { by: 'user' }), /niet terug te halen/);
  m = M.purge(m, id, { by: 'user' });
  assert.equal(m.entries.length, 0);
  assert.deepEqual(M.validate(m), []);
});

test('verouderd markeren en terughalen', () => {
  let { m, idGen } = fresh();
  m = M.addInterest(m, 'Schaken', { now: T0, idGen });
  const id = m.entries[0].id;
  m = M.markOutdated(m, id, { by: 'user', now: day(5) });
  assert.equal(M.active(m).length, 0);
  m = M.restore(m, id, { by: 'user', now: day(6) });
  assert.equal(M.active(m).length, 1);
});

test('onbevestigde verbanden verlopen vanzelf', () => {
  let { m, idGen } = fresh();
  m = M.addPossible(m, 'Misschien speelt A mee', { now: T0, idGen });
  m = M.expireStale(m, { now: day(M.POSSIBLE_EXPIRY_DAYS - 1) });
  assert.equal(m.entries[0].status, 'active');
  m = M.expireStale(m, { now: day(M.POSSIBLE_EXPIRY_DAYS + 1) });
  assert.equal(m.entries[0].status, 'outdated');
  assert.equal(m.entries[0].history.at(-1).action, 'expired');
});

test('herijking: oude items komen op de lijst; bevestigen of uitstellen schuift ze op', () => {
  let { m, idGen } = fresh();
  m = M.addOwnInsight(m, 'Ik schrijf graag', { now: T0, idGen });
  assert.equal(M.dueForReview(m, { now: day(10) }).length, 0);
  assert.equal(M.dueForReview(m, { now: day(M.REVIEW_DAYS.insight + 1) }).length, 1);
  const id = m.entries[0].id;
  const r = M.reaffirm(m, id, { by: 'user', now: day(M.REVIEW_DAYS.insight + 1) });
  assert.equal(M.dueForReview(r, { now: day(M.REVIEW_DAYS.insight + 2) }).length, 0);
  const p = M.postponeReview(m, id, { days: 30, now: day(M.REVIEW_DAYS.insight + 1) });
  assert.equal(M.dueForReview(p, { now: day(M.REVIEW_DAYS.insight + 2) }).length, 0);
});

test('overgeslagen verband: tijdelijk onderdrukt, daarna weer mogelijk', () => {
  let { m } = fresh();
  m = M.noteSkippedPossible(m, 'Misschien hangt koffie samen met onrust', { now: T0 });
  assert.equal(M.isSuppressed(m, 'Misschien hangt koffie samen met onrust', { now: day(5) }), true);
  assert.equal(M.isSuppressed(m, 'Misschien hangt koffie samen met onrust', { now: day(M.SKIP_COOLDOWN_DAYS + 1) }), false);
});

test('bewerken door gebruiker; bewerkt verband blijft onbevestigd', () => {
  let { m, idGen } = fresh();
  m = M.addPossible(m, 'Misschien A', { now: T0, idGen });
  m = M.edit(m, m.entries[0].id, { by: 'user', text: 'Misschien A, maar alleen in de winter', now: day(1) });
  assert.equal(m.entries[0].type, 'possible');
  assert.equal(m.entries[0].text, 'Misschien A, maar alleen in de winter');
  assert.throws(() => M.edit(m, m.entries[0].id, { by: 'nexus', text: 'x' }));
});

test('alles wissen', () => {
  let { m, idGen } = fresh();
  m = M.addTold(m, 'Iets', { now: T0, idGen });
  m = M.wipeAll(m, { by: 'user', now: day(1) });
  assert.equal(m.entries.length, 0);
  assert.throws(() => M.wipeAll(m, { by: 'nexus' }));
});

test('validatie en (de)serialisatie weigeren ongeldige of gemanipuleerde data', () => {
  let { m, idGen } = fresh();
  m = M.addTold(m, 'Iets', { now: T0, idGen });
  const back = M.deserialize(M.serialize(m));
  assert.deepEqual(back, m);
  const bad = structuredClone(m);
  bad.entries.push({ id: 'x', type: 'insight', origin: 'nexus', status: 'active', text: 'Jij bent X' });
  assert.throws(() => M.deserialize(JSON.stringify(bad)), /inzicht zonder bevestiging/);
  const bad2 = structuredClone(m);
  bad2.entries.push({ id: 'y', type: 'possible', origin: 'user', status: 'active', text: 'z', alternatives: [] });
  assert.throws(() => M.deserialize(bad2), /moet van NEXUS komen/);
  assert.throws(() => M.addTold(m, '   ', { now: T0, idGen }), /lege tekst/);
  assert.throws(() => M.addTold(m, 'x'.repeat(501), { now: T0, idGen }), /te lang/);
});
