// Open Kompas — opslagpoort.
//
// Open Kompas schrijft zelf NIET naar localStorage of een server. Het werkt via een adapter
// met deze vorm (alle methodes async):
//
//   { id: string, load(): Promise<string|null>, save(json: string): Promise<void>, wipe(): Promise<void> }
//
// Nu bestaat alleen de in-memory-adapter (voor tests en het prototype; alles weg na herladen).
// Na P0 levert de beveiligingslaag een versleutelde adapter die ook de toestemming afdwingt.

import * as M from './memory.js';

export function createInMemoryAdapter(initial = null) {
  let data = initial;
  return {
    id: 'in-memory',
    async load() { return data; },
    async save(json) { data = json; },
    async wipe() { data = null; },
  };
}

export function assertAdapter(adapter) {
  for (const k of ['load', 'save', 'wipe']) if (typeof adapter?.[k] !== 'function') throw new Error(`Kompas: opslag-adapter mist ${k}()`);
  return adapter;
}

/**
 * Pas geheugen-operaties uit de gespreksmotor toe. Elke operatie is het gevolg van een
 * expliciete keuze van de gebruiker (knop of "klopt niet"/"sla over" in tekst).
 */
export function applyOps(memory, ops, { now, idGen } = {}) {
  let m = memory;
  for (const o of ops || []) {
    const by = 'user';
    switch (o.op) {
      case 'addTold': m = M.addTold(m, o.text, { now, idGen, topics: o.topics }); break;
      case 'addValue': m = M.addValue(m, o.text, { now, idGen, topics: o.topics }); break;
      case 'addInterest': m = M.addInterest(m, o.text, { now, idGen, topics: o.topics }); break;
      case 'addPossible': if (!M.isSuppressed(m, o.text, { now })) m = M.addPossible(m, o.text, { now, idGen, topics: o.topics, alternatives: o.alternatives, evidence: o.evidence }); break;
      case 'addPossibleThenConfirm': {
        if (M.isSuppressed(m, o.text, { now })) break;
        m = M.addPossible(m, o.text, { now, idGen, topics: o.topics, alternatives: o.alternatives, evidence: o.evidence });
        m = M.confirm(m, m.entries[m.entries.length - 1].id, { by, now });
        break;
      }
      case 'reaffirm': m = M.reaffirm(m, o.id, { by, now }); break;
      case 'markOutdated': m = M.markOutdated(m, o.id, { by, now }); break;
      case 'postponeReview': m = M.postponeReview(m, o.id, { now }); break;
      case 'noteSkippedPossible': m = M.noteSkippedPossible(m, o.text, { now }); break;
      case 'noteRejectedPossible': m = M.noteRejectedPossible(m, o.text, { now }); break;
      default: throw new Error(`Kompas: onbekende operatie ${o.op}`);
    }
  }
  return m;
}

/** Een voorstel ("Onthouden?") omzetten naar een operatie — alleen aanroepen na klik van de gebruiker. */
export function proposalToOp(p) {
  const map = { told: 'addTold', value: 'addValue', interest: 'addInterest' };
  if (!map[p.type]) throw new Error(`Kompas: onbekend voorsteltype ${p.type}`);
  return { op: map[p.type], text: p.text, topics: p.topics || [] };
}

/** Kleine repository: geheugen + adapter, met validatie bij laden. */
export function createKompasRepository(adapter) {
  assertAdapter(adapter);
  return {
    async load({ now } = {}) {
      const raw = await adapter.load();
      const m = raw ? M.deserialize(raw) : M.createMemory({ now });
      return M.expireStale(m, { now });
    },
    async save(memory) {
      const errors = M.validate(memory);
      if (errors.length) throw new Error(`Kompas: niet opgeslagen — ${errors.join('; ')}`);
      await adapter.save(M.serialize(memory));
    },
    async wipe() { await adapter.wipe(); },
  };
}
