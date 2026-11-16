import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, respond, CORE_ACTIONS } from '../../js/kompas/conversation.js';
import * as M from '../../js/kompas/memory.js';
import { applyOps, proposalToOp } from '../../js/kompas/storage.js';
import { lintOutgoing, tunnelReport } from '../../js/kompas/guards.js';
import { T0, day, seqIds, SCRIPT, SYNTHETIC_SAM } from './fixtures.mjs';

function runner({ memory = M.createMemory({ now: T0 }), first = true, now = T0 } = {}) {
  const idGen = seqIds();
  let { session, reply } = startSession({ memory, isFirstSession: first, now, idGen });
  const log = [reply];
  let mem = memory;
  return {
    get session() { return session; },
    get memory() { return mem; },
    log,
    first: reply,
    say(input) {
      const r = respond(session, mem, typeof input === 'string' ? { type: 'text', text: input } : input, { now });
      session = r.session;
      mem = applyOps(mem, r.memoryOps, { now, idGen });
      log.push(r.reply);
      return r.reply;
    },
    accept(proposal) { mem = applyOps(mem, [proposalToOp(proposal)], { now, idGen }); },
  };
}

const sam = () => {
  const idGen = seqIds();
  let m = M.createMemory({ now: T0 });
  for (const t of SYNTHETIC_SAM.told) m = M.addTold(m, t.text, { now: T0, idGen, topics: t.topics });
  for (const t of SYNTHETIC_SAM.values) m = M.addValue(m, t.text, { now: T0, idGen, topics: t.topics });
  for (const t of SYNTHETIC_SAM.interests) m = M.addInterest(m, t.text, { now: T0, idGen, topics: t.topics });
  for (const t of SYNTHETIC_SAM.possible) m = M.addPossible(m, t.text, { now: T0, idGen, topics: t.topics, alternatives: t.alternatives });
  return m;
};

test('open kennismaking: geen vragenlijst, keuze om vrij te beginnen of niet te weten', () => {
  const r = runner();
  const ids = r.first.actions.map((a) => a.id);
  assert.ok(ids.includes('intro-free'));
  assert.ok(ids.includes('intro-unsure'));
  assert.ok(ids.includes('intro-why'));
  assert.doesNotMatch(r.first.text, /\?.*\?/s, 'opening stelt niet meerdere vragen');
  assert.doesNotMatch(r.first.text, /doel/i, 'opening vraagt niet naar doelen');
  assert.equal(r.say({ type: 'action', id: 'intro-unsure' }).preferencesChanged.goalQuietUntil != null, true);
});

test('elk antwoord bevat altijd de zes vaste keuzes en doorstaat de taalcontrole', () => {
  const r = runner();
  for (const step of SCRIPT) r.say(step);
  for (const reply of r.log) {
    assert.deepEqual(reply.coreActions.map((a) => a.id), CORE_ACTIONS.map((a) => a.id));
    assert.ok(reply.guard.lint.ok, `lint: ${reply.text}`);
    assert.ok(lintOutgoing(reply.text).violations.every((v) => v.rule !== 'no-identity-label'));
  }
});

test('vervolgvragen sluiten aan op de woorden van de gebruiker', () => {
  const r = runner();
  r.say('Ik ben begonnen met keramiek op dinsdagavond');
  const rep = r.say({ type: 'action', id: 'deeper' });
  assert.match(rep.text, /keramiek op dinsdagavond|dinsdagavond/);
});

test('andere invalshoek herhaalt niet dezelfde vraag', () => {
  const r = runner();
  r.say('Ik ben begonnen met keramiek op dinsdagavond');
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const t = r.say({ type: 'action', id: 'angle' }).text.replace(/^Een andere kant: /, '');
    assert.ok(!seen.has(t), `herhaling: ${t}`);
    seen.add(t);
  }
});

test('over iets heel anders: onderwerp losgelaten en niet door NEXUS teruggehaald', () => {
  const memory = sam();
  const r = runner({ memory, first: false });
  r.say('Het is druk op mijn werk met die diensten');
  const sw = r.say({ type: 'action', id: 'switch' });
  assert.equal(sw.move, 'switch');
  assert.ok(r.session.flags.declinedTopics.includes('werk'));
  r.say('Ik heb zin om iets te bakken');
  r.say('Misschien een appeltaart');
  const report = tunnelReport(r.session);
  assert.deepEqual(report.nexusPulledBack, []);
  assert.ok(!r.log.slice(-2).some((x) => /diensten|ploegendienst/i.test(x.text)), 'werk komt niet terug');
});

test('praktische modus: geen psychologische duiding, eindigt met samenvatting', () => {
  const r = runner();
  r.say('Hoe kan ik mijn fiets laten repareren zonder dat het een hele dag kost?');
  r.say('Ik heb een fietsenmaker gebeld');
  r.say('Online een afspraak maken');
  const last = r.say('Morgen na het werk');
  assert.match(last.text, /Samengevat/);
  for (const rep of r.log) assert.notEqual(rep.move, 'reflect');
  assert.equal(r.session.mode, 'open');
});

test('vraag overslaan: dezelfde vraag komt niet terug', () => {
  const r = runner();
  r.say('Ik heb vandaag in de tuin gewerkt');
  const q = r.session.lastQuestion;
  r.say({ type: 'action', id: 'skip' });
  assert.ok(r.session.skippedQuestions.includes(q));
  for (let i = 0; i < 5; i++) r.say({ type: 'action', id: 'angle' });
  assert.ok(!r.session.usedAngles.slice(-5).includes(q));
});

test('reflectie: hypothese voorzichtig, met alternatieven, en "klopt niet" onderdrukt hem', () => {
  const r = runner();
  r.say('Ik voel me vaak onrustig de laatste tijd');
  r.say('Die onrust voel ik vooral op zondagavond');
  const rep = r.log.at(-1);
  assert.equal(rep.move, 'reflect');
  assert.match(rep.text, /vraag me af|misschien/i);
  assert.match(rep.text, /toeval|iets anders/i);
  const pending = r.session.pendingReflection.text;
  r.say('Nee, dat klopt niet');
  assert.equal(M.isSuppressed(r.memory, pending, { now: T0 }), true);
  assert.equal(r.memory.entries.length, 0, 'niets opgeslagen');
  // Direct daarna geen nieuwe reflectie (eerst luisteren).
  r.say('Het komt gewoon door het weekend dat eindigt');
  const next = r.say('Ik voel me dan nog steeds onrustig');
  assert.notEqual(next.move, 'reflect');
});

test('reflectie bevestigen → inzicht; "misschien" → onbevestigd mogelijk verband', () => {
  const r = runner();
  r.say('Ik voel me vaak onrustig de laatste tijd');
  r.say('Die onrust voel ik vooral op zondagavond');
  r.say({ type: 'action', id: 'reflection-maybe' });
  const [e] = M.active(r.memory);
  assert.equal(e.type, 'possible');
  assert.equal(M.isFact(e), false);

  const r2 = runner();
  r2.say('Ik voel me vaak onrustig de laatste tijd');
  r2.say('Die onrust voel ik vooral op zondagavond');
  r2.say({ type: 'action', id: 'reflection-confirm' });
  assert.equal(M.active(r2.memory)[0].type, 'insight');
  assert.ok(M.active(r2.memory)[0].lastConfirmedAt);
});

test('niets wordt onthouden zonder expliciete keuze', () => {
  const r = runner();
  for (const step of SCRIPT) r.say(step);
  assert.equal(r.memory.entries.length, 0);
  const proposal = r.log.flatMap((x) => x.proposals).find((p) => p.type === 'value');
  assert.ok(proposal, 'waarde voorgesteld');
  r.accept(proposal);
  assert.equal(M.layers(r.memory).value.length, 1);
});

test('hobby en plezier worden niet psychologisch geïnterpreteerd', () => {
  const r = runner();
  const reps = ['Ik speel graag gitaar', 'Vooral blues, met vrienden in het weekend', 'Gisteren hebben we een nieuw nummer geleerd', 'Volgende week spelen we in een café'].map((t) => r.say(t));
  for (const rep of reps) assert.notEqual(rep.move, 'reflect');
  assert.ok(reps.every((rep) => !/merk je bij jezelf|belangrijk voor je/i.test(rep.text)));
});

test('geen doelvragen in de eerste sessie, ook niet als het woord valt', () => {
  const r = runner();
  const rep = r.say('Ik wil eigenlijk doelen stellen');
  assert.notEqual(rep.move, 'goal');
  const r2 = runner({ first: false });
  assert.equal(r2.say('Ik wil eigenlijk doelen stellen').move, 'goal');
  assert.notEqual(r2.say('Ik denk na over doelen voor dit jaar').move, 'goal', 'hoogstens één doelvraag');
});

test('vervolgsessie: hoogstens één suggestie uit het geheugen, en een herijking als iets oud is', () => {
  const memory = sam();
  const r = runner({ memory, first: false, now: day(200) });
  const memoryActions = r.first.actions.filter((a) => a.id.startsWith('review') || a.id === 'recall-interest');
  const distinctItems = new Set(memoryActions.map((a) => a.payload));
  assert.equal(distinctItems.size, 1);
  assert.match(r.first.text, /Klopt dat nog/);
  // Onbevestigde verbanden worden nooit als herijking ("we noteerden") gepresenteerd.
  assert.doesNotMatch(r.first.text, /slapen en de late diensten/);
  r.say({ type: 'action', id: 'review-outdated', payload: memoryActions[0].payload });
  assert.equal(M.archived(r.memory).length, 1);
});

test('veiligheidssignaal: verwijzing naar 113/112, geen verkenning', () => {
  const r = runner();
  const rep = r.say('Soms wil ik niet meer leven');
  assert.equal(rep.move, 'safety');
  assert.match(rep.text, /113/);
  assert.match(rep.text, /112/);
});

test('oefeningen alleen op verzoek, en uit te zetten', () => {
  const r = runner();
  const offer = r.say('Heb je een oefening voor als ik pieker?');
  assert.equal(offer.move, 'tool-offer');
  const approaches = offer.text;
  assert.match(approaches, /vrijblijvend/);
  const off = r.say({ type: 'action', id: 'tools-off' });
  assert.equal(off.preferencesChanged.toolsOff, true);
  const start = r.say({ type: 'action', id: 'tool-start', payload: 'journal-free' });
  assert.equal(start.move, 'tool');
  assert.match(start.text, /stoppen/);
});

test('motor is puur: invoersessie wordt niet gemuteerd', () => {
  const { session } = startSession({ isFirstSession: true, now: T0, idGen: seqIds() });
  const before = JSON.stringify(session);
  respond(session, M.createMemory({ now: T0 }), { type: 'text', text: 'Hallo' }, { now: T0 });
  assert.equal(JSON.stringify(session), before);
});

test('praktisch via de knop neemt het vorige onderwerp niet aan, maar biedt het aan', () => {
  const r = runner();
  r.say('Ik vind het leuk om te tekenen');
  r.say({ type: 'action', id: 'switch' });
  const p = r.say({ type: 'action', id: 'practical' });
  assert.match(p.text, /Wat wil je precies geregeld/);
  const next = r.say('ja');
  assert.match(next.text, /geprobeerd/);
  const r2 = runner();
  r2.say({ type: 'action', id: 'practical' });
  r2.say('Mijn zolder opruimen');
  assert.match(r2.log.at(-1).text, /geprobeerd/);
});
