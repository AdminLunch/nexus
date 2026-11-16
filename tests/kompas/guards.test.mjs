import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintOutgoing, allowInterpretation, allowGoalQuestion, allowRecall, allowToolOffer, allowReview, tunnelReport, POLICY } from '../../js/kompas/guards.js';
import { detectIntent, detectTopics, primaryDomain, detectSaveCandidates, echoPhrase } from '../../js/kompas/topics.js';

const rules = (text, ctx) => lintOutgoing(text, ctx).violations.map((v) => v.rule);

test('taalcontrole: geen identiteitslabels', () => {
  for (const t of ['Je bent gewoon een perfectionist type.', 'Jij bent iemand die alles uitstelt.', 'Dat is typisch jij.', 'Jouw persoonlijkheidstype is INTJ.', 'Je bent altijd zo kritisch.', 'Je bent echt een introvert persoon.']) {
    assert.ok(rules(t).includes('no-identity-label') || rules(t).includes('no-diagnosis'), t);
  }
  assert.ok(lintOutgoing('Je bent welkom om verder te vertellen wanneer je wilt.').ok);
  assert.ok(lintOutgoing('Wat merk je bij jezelf als je daaraan denkt?').ok);
});

test('taalcontrole: geen diagnoses tenzij de gebruiker het woord zelf gebruikte', () => {
  assert.deepEqual(rules('Het klinkt als een burn-out.'), ['no-diagnosis']);
  assert.ok(rules('Misschien is het ADHD?').includes('no-diagnosis'));
  assert.ok(lintOutgoing('Je noemde ADHD — wil je daar iets over vertellen?', { userMentioned: 'Ik heb ADHD' }).ok);
});

test('taalcontrole: hypotheses nooit als feit', () => {
  assert.ok(rules('Het komt doordat je bang bent om te falen.').includes('no-hypothesis-as-fact'));
  assert.ok(rules('Diep van binnen wil je erkenning.').includes('no-hypothesis-as-fact'));
  assert.ok(rules('Werk en slaap hangen samen.', { isHypothesis: true }).includes('hypothesis-needs-hedge'));
  assert.ok(lintOutgoing('Ik vraag me af of werk en slaap misschien samenhangen?', { isHypothesis: true }).ok);
});

test('taalcontrole: geen sturing richting één levensdoel', () => {
  assert.ok(rules('Dit is je ware doel in het leven.').includes('no-life-purpose'));
  assert.ok(rules('Misschien is tekenen je roeping.').includes('no-life-purpose'));
  assert.ok(rules('Je moet eigenlijk gaan kiezen voor kunst.').includes('no-life-purpose'));
});

const ses = (turns = [], extra = {}) => ({ turns, flags: { declinedTopics: [], ...extra.flags }, preferences: extra.preferences || {}, isFirstSession: !!extra.first, focusDepth: 0 });

test('geen psychologische duiding bij praktisch, hobby of plezier', () => {
  for (const domain of ['practical', 'interest', 'play', 'work', 'health']) {
    assert.equal(allowInterpretation(ses(), { domain, intent: 'share' }).allowed, false, domain);
  }
  assert.equal(allowInterpretation(ses(), { domain: 'feeling', intent: 'share' }).allowed, true);
  assert.equal(allowInterpretation(ses(), { domain: 'feeling', intent: 'practical' }).allowed, false);
});

test('interpretatiebudget en rust na afwijzing', () => {
  const turns = [{ role: 'nexus', move: 'reflect' }, { role: 'nexus', move: 'listen' }];
  assert.equal(allowInterpretation(ses(turns), { domain: 'feeling', intent: 'share' }).allowed, false);
  const many = Array.from({ length: 8 }, () => ({ role: 'nexus', move: 'listen' }));
  assert.equal(allowInterpretation(ses(many), { domain: 'feeling', intent: 'share' }).allowed, true);
  assert.equal(allowInterpretation(ses(many, { flags: { lastReflectionRejected: true } }), { domain: 'feeling', intent: 'share' }).allowed, false);
});

test('doelvragen: alleen als de gebruiker erover begint, niet in eerste sessie, niet na "weet ik niet"', () => {
  assert.equal(allowGoalQuestion(ses(), { userRaisedGoals: false }).allowed, false);
  assert.equal(allowGoalQuestion(ses([], { first: true }), { userRaisedGoals: true }).allowed, false);
  assert.equal(allowGoalQuestion(ses(), { userRaisedGoals: true, now: '2026-01-01T00:00:00Z' }).allowed, true);
  assert.equal(allowGoalQuestion(ses([], { flags: { goalQuestions: 1 } }), { userRaisedGoals: true }).allowed, false);
  assert.equal(allowGoalQuestion(ses([], { preferences: { goalQuietUntil: '2026-02-01T00:00:00Z' } }), { userRaisedGoals: true, now: '2026-01-15T00:00:00Z' }).allowed, false);
});

test('terughalen, herijken en oefeningen zijn begrensd', () => {
  assert.equal(allowRecall(ses([], { flags: { nexusRecalls: POLICY.maxNexusRecallsPerSession } }), 'werk').allowed, false);
  assert.equal(allowRecall(ses([], { flags: { declinedTopics: ['werk'] } }), 'werk').allowed, false);
  assert.equal(allowRecall(ses(), 'werk').allowed, true);
  assert.equal(allowReview(ses([], { flags: { reviews: 1 } })).allowed, false);
  assert.equal(allowReview(ses([], { first: true })).allowed, false);
  assert.equal(allowToolOffer(ses(), { domain: 'practical' }).allowed, false);
  assert.equal(allowToolOffer(ses(), { domain: 'practical', requested: true }).allowed, true);
  assert.equal(allowToolOffer(ses([], { preferences: { toolsOff: true } }), { domain: 'feeling' }).allowed, false);
});

test('tunnelrapport signaleert als NEXUS steeds hetzelfde onderwerp terughaalt', () => {
  const r = tunnelReport({ turns: [
    { role: 'user', topics: ['werk'], domain: 'work' },
    { role: 'nexus', topics: ['werk'], initiatedTopic: true, move: 'listen' },
    { role: 'user', topics: ['creatief'], domain: 'interest' },
    { role: 'nexus', topics: ['werk'], initiatedTopic: true, move: 'reflect' },
  ] });
  assert.deepEqual(r.nexusPulledBack, ['werk']);
  assert.equal(r.domainVariety, 2);
  assert.equal(r.interpretRatio, 0.5);
});

test('intentieherkenning voor de stuurkeuzes', () => {
  assert.equal(detectIntent('Nee, dat klopt niet'), 'disagree');
  assert.equal(detectIntent('Sla deze vraag over'), 'skip');
  assert.equal(detectIntent('Kunnen we over iets anders praten?'), 'switch');
  assert.equal(detectIntent('Hoe kan ik dit regelen?'), 'practical');
  assert.equal(detectIntent('Ik weet eigenlijk niet wat ik wil'), 'unsure');
  assert.equal(detectIntent('Heb je een schrijfopdracht?'), 'tools');
  assert.equal(detectIntent('Ik wil er geen eind aan mijn leven maken maar soms…'), 'safety');
  assert.equal(detectIntent('Ik ging vandaag wandelen'), 'share');
  // Geen valse "klopt niet" bij gewone zinnen.
  assert.notEqual(detectIntent('Ik weet niet waar te beginnen met verhuizen'), 'disagree');
  assert.notEqual(detectIntent('Dat is niet zo erg hoor'), 'disagree');
  assert.equal(detectIntent('Dat is het niet'), 'disagree');
  assert.equal(detectIntent('Dat herken ik niet'), 'disagree');
});

test('domein: psychologisch alleen als de gebruiker zelf gevoelswoorden gebruikt', () => {
  assert.equal(primaryDomain(detectTopics('Het rooster op mijn werk is lastig')), 'work');
  assert.equal(primaryDomain(detectTopics('Op werk voel ik me onrustig')), 'feeling');
  assert.equal(primaryDomain(detectTopics('Ik speel graag gitaar')), 'interest');
});

test('bewaarvoorstellen en citaten', () => {
  assert.deepEqual(detectSaveCandidates('Ik vind eerlijkheid echt belangrijk.'), [{ type: 'value', text: 'eerlijkheid' }]);
  assert.equal(detectSaveCandidates('Ik ben nieuwsgierig naar sterrenkunde')[0].type, 'interest');
  assert.deepEqual(detectSaveCandidates('Vandaag was oké'), []);
  assert.equal(echoPhrase('Het was druk, maar de wandeling met de hond was fijn.'), 'de wandeling met de hond was fijn');
});
