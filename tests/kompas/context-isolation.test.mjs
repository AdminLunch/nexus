import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../js/kompas/memory.js';
import { buildKompasContext, REQUIRED_CONSENT_SCOPES } from '../../js/kompas/context.js';
import { createInMemoryAdapter, createKompasRepository, applyOps } from '../../js/kompas/storage.js';
import { T0, day, seqIds } from './fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../js/kompas');

test('AI-context scheidt feiten van onbevestigde verbanden en laat het archief weg', () => {
  const idGen = seqIds();
  let m = M.createMemory({ now: T0 });
  m = M.addTold(m, 'Ik werk in de zorg', { now: T0, idGen, topics: ['werk'] });
  m = M.addValue(m, 'Rust', { now: T0, idGen });
  m = M.addPossible(m, 'Misschien hangen diensten en slaap samen', { now: T0, idGen, topics: ['slaap'] });
  m = M.addTold(m, 'GEHEIM-VERWIJDERD', { now: T0, idGen });
  m = M.remove(m, m.entries.at(-1).id, { by: 'user', now: T0 });
  m = M.addTold(m, 'OUD-ITEM', { now: T0, idGen });
  m = M.markOutdated(m, m.entries.at(-1).id, { by: 'user', now: T0 });

  const ctx = buildKompasContext(m, { now: day(1) });
  assert.deepEqual(ctx.requiredConsentScopes, REQUIRED_CONSENT_SCOPES);
  assert.equal(ctx.userToldMe.length, 1);
  assert.equal(ctx.openPossibilities.length, 1);
  assert.equal(ctx.openPossibilities[0].status, 'ONBEVESTIGD');
  assert.ok(ctx.openPossibilities[0].alternatives.length >= 1);
  assert.ok(ctx.confirmedByUser.every((x) => !/diensten/.test(x.text)));
  const json = JSON.stringify(ctx);
  assert.ok(!json.includes('GEHEIM-VERWIJDERD'));
  assert.ok(!json.includes('OUD-ITEM'));
  assert.ok(!json.includes('"id"'), 'geen interne id’s');
  assert.ok(!json.includes('history'), 'geen geschiedenis');
  assert.ok(ctx.rules.some((r) => /nooit als feit/.test(r)));

  const scoped = buildKompasContext(m, { now: day(1), topics: ['slaap'] });
  assert.equal(scoped.userToldMe.length, 0, 'dataminimalisatie per onderwerp');
  assert.equal(scoped.userValues.length, 1, 'waarden blijven beschikbaar');
  assert.equal(buildKompasContext(m, { now: day(40) }).openPossibilities.length, 0, 'verlopen verbanden niet meer mee');
});

test('repository: in-memory adapter, validatie bij opslaan, vervallen bij laden', async () => {
  const adapter = createInMemoryAdapter();
  const repo = createKompasRepository(adapter);
  const idGen = seqIds();
  let m = await repo.load({ now: T0 });
  m = applyOps(m, [{ op: 'addPossible', text: 'Misschien A en B', topics: [] }], { now: T0, idGen });
  await repo.save(m);
  const loaded = await repo.load({ now: day(31) });
  assert.equal(loaded.entries[0].status, 'outdated');
  const broken = structuredClone(m);
  broken.entries[0].origin = 'user';
  await assert.rejects(() => repo.save(broken), /niet opgeslagen/);
  await repo.wipe();
  assert.equal(await adapter.load(), null);
  assert.throws(() => createKompasRepository({ load() {} }), /mist save/);
});

test('isolatie: Open Kompas importeert geen bestanden die P0 aanpast en gebruikt geen opslag/netwerk', () => {
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const code = src.replace(/\/\/.*$/gm, '');
    for (const imp of code.matchAll(/from\s+['"]([^'"]+)['"]/g)) assert.match(imp[1], /^\.\/[a-z-]+\.js$/, `${f} importeert ${imp[1]}`);
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'document.', 'window.']) {
      assert.ok(!code.includes(forbidden), `${f} gebruikt ${forbidden}`);
    }
  }
});
