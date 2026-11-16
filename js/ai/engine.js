// NEXUS AI — uitbreidbare assistent-module.
//
// Een "provider" is een object met:
//   id:        unieke sleutel
//   name:      weergavenaam
//   sub:       korte omschrijving onder de titel
//   available: async () => boolean
//   reply:     async (bericht, geschiedenis) => string (HTML, al ge-escaped)
//   external:  true als het verzoek het toestel verlaat. Dan geldt de P0-toestemming per
//              categorie en per bestemming (js/privacy/consent.js): zonder keuze gaat er niets weg.
//
// Nieuwe provider? Roep registerProvider() aan met zo'n object.
// Open Kompas: geen vaste aannames over de gebruiker (geen diagnose, type of levensdoel) in prompts.

import { getState, update, today, addDays, lastDays, prioritiesFor, habitsDoneOn, habitStreak, workoutMinutes, recoveryScore, dayScore, goalProgress, uid, nutritionTotals } from '../store.js';
import { buildAiRequest, grantedScopes, hasDecided, endpointHost, logShare, CLAUDE_HOST } from '../privacy/consent.js';
import { SLOTS, MAIN_SLOTS, FOODS, TAGS, tagById, slotById, slotStatus, mealsOn, eatenMeals, tagCounts, waterOn, planFor, periodSummary, saveMeal, skipSlot, setWater, setPlan, detectTags, nowTime, slotForTime } from '../nutrition/data.js';
import { allInsights, strength } from '../nutrition/insights.js';

const providers = new Map();
export function registerProvider(p) { providers.set(p.id, p); }
export function getProviders() { return [...providers.values()]; }

/** De gekozen provider (of NEXUS Core). Externe providers controleren zelf toestemming en beschikbaarheid. */
export function activeProvider() {
  return providers.get(getState().settings.aiProvider) || providers.get('local');
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Compacte samenvatting van je data — alleen voor NEXUS Core (lokaal). Externe modellen krijgen buildAiRequest(). */
export function buildContext() {
  const s = getState();
  const t = today();
  const d7 = lastDays(7);
  const sleep7 = d7.map((d) => s.sleep[d]?.hours).filter((x) => x != null);
  const mood7 = d7.map((d) => s.moods[d]?.mood).filter((x) => x != null);
  const energy7 = d7.map((d) => s.moods[d]?.energy).filter((x) => x != null);
  const focus7 = d7.map((d) => s.moods[d]?.focus).filter((x) => x != null);
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  return {
    date: t,
    weekday: new Date().toLocaleDateString('nl-NL', { weekday: 'long' }),
    time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    name: s.settings.name,
    priorities: prioritiesFor(t),
    openYesterday: prioritiesFor(addDays(t, -1)).filter((p) => !p.done),
    moodToday: s.moods[t] || null,
    avgMood7: avg(mood7),
    avgEnergy7: avg(energy7),
    avgFocus7: avg(focus7),
    sleepToday: s.sleep[t] || null,
    avgSleep7: avg(sleep7),
    sleepDays7: sleep7.length,
    sleepTarget: s.settings.sleepTarget,
    trainingMin7: workoutMinutes(d7),
    trainingTarget: s.settings.weeklyTrainingTarget,
    workouts7: s.workouts.filter((w) => d7.includes(w.date)).map((w) => ({ date: w.date, type: w.type, minutes: w.minutes, intensity: w.intensity })),
    recovery: recoveryScore(t),
    dayScore: dayScore(t),
    reflectionToday: s.reflections[t] || null,
    habits: s.habits.map((h) => ({ name: h.name, doneToday: habitsDoneOn(t).includes(h.id), streak: habitStreak(h.id), rate7: d7.filter((d) => habitsDoneOn(d).includes(h.id)).length })),
    goals: s.goals.map((g) => ({ title: g.title, category: g.category, deadline: g.deadline, progress: goalProgress(g), next: g.milestones.find((m) => !m.done)?.text || null })),
    nutrition: nutritionContext(),
  };
}

/** Voedingscontext: vandaag, 7 dagen, planning en inzichten (30 dagen). Alleen geregistreerde data. */
export function nutritionContext() {
  const s = getState();
  const t = today();
  const d7 = lastDays(7);
  const week = periodSummary(d7);
  const ins = allInsights(30);
  const cmp = (x) => (x.enough ? { withMean: x.yes.mean, withN: x.yes.n, withoutMean: x.no.mean, withoutN: x.no.n, diff: x.diff } : { notEnoughData: true, withN: x.yes.n, withoutN: x.no.n });
  return {
    today: {
      slots: Object.fromEntries(SLOTS.map((sl) => [sl.id, sl.id === 'snack' ? (eatenMeals(t).some((m) => m.slot === 'snack') ? 'eaten' : 'empty') : slotStatus(t, sl.id)])),
      meals: eatenMeals(t).map((m) => ({ slot: m.slot, time: m.time, name: m.name || '(geen omschrijving)', tags: m.tags })),
      water: waterOn(t),
      buildingBlocks: tagCounts(t),
    },
    last7Days: {
      loggedDays: week.loggedDays,
      perSlot: week.perSlot,
      buildingBlocks: week.tags,
      avgWater: week.avgWater,
      waterTarget: s.settings.waterTarget || 8,
      meals: week.meals.slice(-40).map((m) => ({ date: m.date, slot: m.slot, time: m.time, name: m.name || '(geen omschrijving)' })),
    },
    plannedTomorrow: planFor(addDays(t, 1)),
    insights30d: {
      loggedDays: ins.loggedDays,
      skipRates: Object.fromEntries(ins.slots.map((x) => [x.id, { skipped: x.skipped, known: x.known }])),
      breakfastVsEnergy: cmp(ins.breakfastEnergy),
      breakfastVsFocus: cmp(ins.breakfastFocus),
      threeMealsVsMood: cmp(ins.regularityMood),
      rhythm: ins.rhythm,
      focusCorrelations: ins.focusCorr.filter((x) => x.enough && x.r != null).map((x) => ({ factor: x.l, r: x.r, n: x.n })),
    },
    note: 'tags: eiwit, vezels, omega3, groentefruit, gefermenteerd, snelsuiker, cafeine. Statussen: eaten/skipped/empty (empty = niet ingevuld, niet hetzelfde als overgeslagen).',
  };
}

// ---------- gedeelde acties (gebruikt door commando's én door Claude) ----------
function logMeal(slot, text, date = today(), extra = {}) {
  const sl = slot === 'avond' ? 'diner' : SLOTS.some((x) => x.id === slot) ? slot : 'snack';
  saveMeal(date, { slot: sl, time: date === today() ? nowTime() : '', name: text, tags: detectTags(text), ...extra });
}
function addPriority(text) {
  update((st) => { (st.priorities[today()] ||= []).push({ id: uid(), text, done: false }); });
}
function addGoal(title, milestones = []) {
  update((st) => { st.goals.push({ id: uid(), title, why: '', category: 'Persoonlijk', deadline: '', milestones: milestones.map((text) => ({ id: uid(), text, done: false })), createdAt: today() }); });
}
function completePriority(query) {
  const q = query.toLowerCase();
  const p = prioritiesFor(today()).find((x) => !x.done && x.text.toLowerCase().includes(q));
  if (!p) return null;
  update((st) => { st.priorities[today()].find((x) => x.id === p.id).done = true; });
  return p.text;
}

// =====================================================================
// Provider 1: NEXUS Core — draait volledig in de pagina, offline.
// Regelgebaseerd: herkent intenties en commando's en analyseert je data.
// =====================================================================
const has = (txt, ...words) => words.some((w) => txt.includes(w));

function summary(c) {
  const lines = [];
  const open = c.priorities.filter((p) => !p.done);
  lines.push(`<b>Dagscore ${c.dayScore}</b> — ${c.priorities.length ? `${c.priorities.length - open.length}/${c.priorities.length} prioriteiten klaar` : 'nog geen prioriteiten gezet'}.`);
  if (open.length) lines.push(`Volgende: <b>${escHtml(open[0].text)}</b>`);
  if (c.recovery != null) lines.push(`Herstel <b>${c.recovery}</b>/100 — ${c.recovery >= 70 ? 'ruimte voor een stevige training' : c.recovery >= 45 ? 'houd het gematigd' : 'focus op rust'}.`);
  else lines.push('Log je slaap voor een herstelscore.');
  const todoHabits = c.habits.filter((h) => !h.doneToday).map((h) => h.name);
  if (todoHabits.length) lines.push(`Gewoontes nog te doen: ${todoHabits.map(escHtml).join(', ')}.`);
  const urgent = c.goals.filter((g) => g.progress < 100 && g.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const nut = c.nutrition?.today;
  if (nut) {
    const open = MAIN_SLOTS.filter((sl) => nut.slots[sl.id] === 'empty').map((sl) => sl.l.toLowerCase());
    lines.push(`Voeding: ${MAIN_SLOTS.filter((sl) => nut.slots[sl.id] === 'eaten').length}/3 hoofdmaaltijden${open.length ? ` (nog open: ${open.join(', ')})` : ''} · 💧 ${nut.water} glazen.`);
  }
  if (urgent) lines.push(`Dichtstbijzijnde deadline: <b>${escHtml(urgent.title)}</b> (${urgent.progress}%)${urgent.next ? ` — volgende mijlpaal: ${escHtml(urgent.next)}` : ''}.`);
  return lines.join('\n');
}

function sleepAnswer(c) {
  if (!c.sleepDays7) return 'Ik heb nog geen slaapdata van de afgelopen week. Log je nachten onder <b>Body</b>, dan kan ik patronen zien.';
  const diff = Math.round((c.avgSleep7 - c.sleepTarget) * 10) / 10;
  let out = `Je sliep gemiddeld <b>${String(c.avgSleep7).replace('.', ',')} uur</b> over ${c.sleepDays7} gelogde nachten (doel ${c.sleepTarget}u).`;
  if (diff < -0.75) out += `\nDat is ${String(Math.abs(diff)).replace('.', ',')} uur per nacht te weinig. Tip: zet een vaste "schermen uit"-tijd 45 min voor bed en houd je opstaantijd gelijk, ook in het weekend.`;
  else if (diff < 0) out += '\nNet onder je doel. Een kwartier eerder naar bed maakt al verschil.';
  else out += '\nJe zit op of boven je doel — goed bezig. Let nu vooral op regelmaat.';
  return out;
}

function moodAnswer(c) {
  if (c.avgMood7 == null) return 'Er is nog geen stemming gelogd deze week. Een check-in kost 3 seconden — op Home of onder <b>Mind</b>.';
  let out = `Gemiddelde stemming deze week: <b>${String(c.avgMood7).replace('.', ',')}/5</b>, energie <b>${c.avgEnergy7 != null ? String(c.avgEnergy7).replace('.', ',') : '—'}/10</b>.`;
  if (c.avgSleep7 != null && c.avgSleep7 < c.sleepTarget - 0.5 && c.avgMood7 < 3.5) out += '\nJe slaap ligt onder je doel en je stemming is wat lager — die twee hangen vaak samen. Begin bij slaap.';
  if (c.trainingMin7 < 60 && c.avgMood7 < 3.5) out += '\nWeinig beweging deze week. Een wandeling van 20 minuten buiten is een snelle stemmingsboost.';
  if (c.avgMood7 >= 4) out += '\nSterke week. Schrijf in je reflectie op wat er goed ging, zodat je het kunt herhalen.';
  return out;
}

function trainingAnswer(c) {
  const pct = Math.round((c.trainingMin7 / (c.trainingTarget || 150)) * 100);
  let out = `Afgelopen 7 dagen: <b>${c.trainingMin7} min</b> in ${c.workouts7.length} trainingen (${pct}% van je doel van ${c.trainingTarget} min).`;
  if (c.recovery != null) {
    out += `\nHerstelscore vandaag: <b>${c.recovery}</b>. `;
    out += c.recovery >= 75 ? 'Goed moment voor intensiteit.' : c.recovery >= 50 ? 'Kies een gematigde training.' : 'Vandaag liever actief herstel: wandelen of mobiliteit.';
  }
  if (pct < 100) out += `\nNog ${Math.max(0, c.trainingTarget - c.trainingMin7)} minuten tot je weekdoel.`;
  return out;
}

function goalsAnswer(c) {
  const active = c.goals.filter((g) => g.progress < 100);
  if (!active.length) return 'Je hebt geen actieve doelen. Zeg bijvoorbeeld: <b>nieuw doel: 5 kg spiermassa erbij</b>.';
  return 'Je actieve doelen:\n' + active.map((g) => `• <b>${escHtml(g.title)}</b> — ${g.progress}%${g.next ? ` · volgende: ${escHtml(g.next)}` : ''}`).join('\n');
}

function habitsAnswer(c) {
  if (!c.habits.length) return 'Je hebt nog geen gewoontes. Voeg ze toe onder <b>Mind → Beheren</b>.';
  const best = [...c.habits].sort((a, b) => b.rate7 - a.rate7)[0];
  const worst = [...c.habits].sort((a, b) => a.rate7 - b.rate7)[0];
  let out = c.habits.map((h) => `• ${escHtml(h.name)}: ${h.rate7}/7 dagen${h.streak ? ` · 🔥 ${h.streak}` : ''}${h.doneToday ? ' ✓' : ''}`).join('\n');
  if (best !== worst) out += `\n\nSterkst: <b>${escHtml(best.name)}</b>. Meeste ruimte: <b>${escHtml(worst.name)}</b> — koppel die aan iets wat je al dagelijks doet (na het tandenpoetsen, bij de koffie).`;
  return out;
}

function focusAnswer(c) {
  const open = c.priorities.filter((p) => !p.done);
  if (!c.priorities.length) {
    if (c.openYesterday.length) return `Je hebt nog geen prioriteiten voor vandaag. Van gisteren staat nog open: <b>${escHtml(c.openYesterday[0].text)}</b>. Begin daarmee?`;
    return 'Nog geen prioriteiten. Kies er maximaal drie: wat maakt vandaag geslaagd? Zeg bijvoorbeeld <b>prioriteit: offerte afmaken</b>.';
  }
  if (!open.length) return 'Alle prioriteiten zijn af. 🎯 Tijd voor rust, of pak één mijlpaal van een doel op.';
  return `Focus nu op: <b>${escHtml(open[0].text)}</b>.\nZet een timer van 25–50 minuten, telefoon in een andere kamer, en doe alleen dit.`;
}

// ---------- voeding (NEXUS Core) ----------
const SLOT_WORDS = { ontbijt: 'ontbijt', ontbijten: 'ontbijt', lunch: 'lunch', middageten: 'lunch', avondeten: 'diner', avond: 'diner', diner: 'diner', snack: 'snack', tussendoor: 'snack', tussendoortje: 'snack' };
const nl1 = (x) => String(x).replace('.', ',');
const SLOT_TIPS = {
  ontbijt: 'Iets kleins telt ook: kefir, een banaan met een handje noten, of overnight oats die je de avond ervoor klaarzet.',
  lunch: 'Zet een herinnering rond lunchtijd, of neem \'s ochtends iets mee dat je zonder nadenken kunt pakken.',
  diner: 'Houd een paar maaltijden van 10 minuten achter de hand: omelet met groente, wrap, of een restje van gisteren.',
};

function nutritionToday(c) {
  const n = c.nutrition.today;
  const eaten = MAIN_SLOTS.filter((sl) => n.slots[sl.id] === 'eaten').map((sl) => sl.l.toLowerCase());
  const open = MAIN_SLOTS.filter((sl) => n.slots[sl.id] === 'empty').map((sl) => sl.l.toLowerCase());
  const blocks = Object.entries(n.buildingBlocks).filter(([k, v]) => v && !['snelsuiker', 'cafeine'].includes(k)).map(([k, v]) => `${tagById(k).e} ${tagById(k).l.toLowerCase()} ${v}×`);
  let out = `<b>Vandaag</b>: ${eaten.length ? eaten.join(', ') + ' gelogd' : 'nog geen hoofdmaaltijd gelogd'}${open.length ? ` · nog open: ${open.join(', ')}` : ''}.`;
  out += `\nWater: <b>${n.water}</b>/${c.nutrition.last7Days.waterTarget} glazen.`;
  if (blocks.length) out += `\nBouwstenen: ${blocks.join(' · ')}.`;
  return out;
}

function weekMeals(c) {
  const w = c.nutrition.last7Days;
  if (!w.loggedDays) return 'Ik zie deze week nog geen maaltijden. Onder <b>Body → Voeding</b> log je met één tik per eetmoment, of typ hier bijvoorbeeld <b>ontbijt: havermout met bessen</b>.';
  const byDay = {};
  w.meals.forEach((m) => { (byDay[m.date] ||= []).push(m); });
  const lines = lastDays(7).filter((d) => mealsOn(d).length).map((d) => {
    const parts = SLOTS.map((sl) => {
      const st = sl.id === 'snack' ? null : slotStatus(d, sl.id);
      const items = (byDay[d] || []).filter((m) => m.slot === sl.id).map((m) => m.name);
      if (items.length) return `${sl.e} ${escHtml(items.join(' + '))}`;
      if (st === 'skipped') return `${sl.e} <i>overgeslagen</i>`;
      return null;
    }).filter(Boolean);
    return `• <b>${new Date(d + 'T12:00').toLocaleDateString('nl-NL', { weekday: 'short' })}</b> ${parts.join(' · ')}`;
  });
  const top = Object.entries(w.buildingBlocks).filter(([k, v]) => v && !['snelsuiker', 'cafeine'].includes(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${tagById(k).l.toLowerCase()} ${v}×`);
  return `Deze week (${w.loggedDays} ${w.loggedDays === 1 ? 'dag' : 'dagen'} gelogd):\n${lines.join('\n')}${top.length ? `\n\nBouwstenen in 7 dagen: ${top.join(', ')}.` : ''}`;
}

function skippedAnswer() {
  const ins = allInsights(30);
  const known = ins.slots.filter((x) => x.known);
  if (!known.length) return 'Ik heb nog geen ingevulde eetmomenten. Tik bij een maaltijd op <b>Overgeslagen</b> als je iets niet eet — dan kan ik patronen zien.';
  const lines = ins.slots.map((x) => `• ${x.e} ${x.l}: ${x.skipped}× overgeslagen van ${x.known} ingevulde dagen${x.empty ? ` (${x.empty} dagen leeg)` : ''}`);
  let out = `Afgelopen 30 dagen:\n${lines.join('\n')}`;
  if (ins.mostSkipped) out += `\n\n<b>${ins.mostSkipped.l}</b> schiet er het vaakst bij in. ${SLOT_TIPS[ins.mostSkipped.id] || ''}`;
  else out += '\n\nGeen duidelijk overgeslagen moment — mooi stabiel.';
  return out;
}

function regularityAnswer() {
  const ins = allInsights(30);
  const r = ins.rhythm;
  if (!r.n) return 'Ik heb nog geen maaltijden met een tijd. Log je eetmomenten een week, dan laat ik je ritme zien.';
  const word = (m) => (m == null ? '' : m < 45 ? 'vrij vast' : m < 90 ? 'wisselend' : 'sterk wisselend');
  const complete = lastDays(30).filter((d) => MAIN_SLOTS.every((sl) => slotStatus(d, sl.id) !== 'empty'));
  const three = complete.filter((d) => MAIN_SLOTS.every((sl) => slotStatus(d, sl.id) === 'eaten')).length;
  let out = `Je eerste maaltijd valt gemiddeld om <b>${r.first}</b>${r.firstSpread != null ? ` (± ${r.firstSpread} min, ${word(r.firstSpread)})` : ''}`;
  if (r.last) out += `, je laatste om <b>${r.last}</b>${r.lastSpread != null ? ` (± ${r.lastSpread} min, ${word(r.lastSpread)})` : ''}`;
  out += '.';
  if (complete.length) out += `\nOp ${three} van de ${complete.length} volledig ingevulde dagen at je alle drie de hoofdmaaltijden.`;
  if (r.firstSpread != null && r.firstSpread >= 60) out += '\nEen vaster ontbijtmoment is vaak de makkelijkste eerste stap naar meer ritme.';
  return out;
}

function patternsAnswer() {
  const ins = allInsights(30);
  const lines = [];
  const cmpLine = (res, what) => {
    if (!res.enough) return null;
    return `• ${what}: gemiddeld <b>${nl1(res.yes.mean)}</b> mét tegenover <b>${nl1(res.no.mean)}</b> zonder (n=${res.yes.n}/${res.no.n}).`;
  };
  [cmpLine(ins.breakfastEnergy, 'Energie en ontbijt'), cmpLine(ins.breakfastFocus, 'Concentratie en ontbijt'), cmpLine(ins.regularityMood, 'Stemming bij 3 hoofdmaaltijden')].forEach((x) => x && lines.push(x));
  ins.focusCorr.filter((x) => x.enough && x.r != null && Math.abs(x.r) >= 0.3).forEach((x) => lines.push(`• Concentratie en ${x.l.toLowerCase()}: ${strength(x.r).l} verband (r=${nl1(x.r)}, n=${x.n}).`));
  if (ins.mostSkipped) lines.push(`• ${ins.mostSkipped.l} sla je het vaakst over (${ins.mostSkipped.skipped}/${ins.mostSkipped.known}).`);
  if (!lines.length) return `Nog geen duidelijke patronen: ik heb minimaal 3 dagen per groep nodig (en 7 dagen voor samenhang). Je hebt ${ins.loggedDays} dagen voeding gelogd in de afgelopen 30 dagen. Een tik per eetmoment en een check-in onder Mind is genoeg.`;
  return `Wat opvalt in je eigen gegevens (30 dagen):\n${lines.join('\n')}\n\nLet op: dit is samenhang, geen bewijs van oorzaak. Slaap, stress en drukke dagen spelen ook mee. Zie <b>Body → Inzichten</b> voor details.`;
}

function planTomorrow(c) {
  const plan = c.nutrition.plannedTomorrow || {};
  const ins = allInsights(30);
  const out = [];
  const have = MAIN_SLOTS.filter((sl) => plan[sl.id]).map((sl) => `${sl.e} ${sl.l}: ${escHtml(plan[sl.id])}`);
  if (have.length) out.push(`Al gepland voor morgen:\n${have.join('\n')}`);
  const missing = MAIN_SLOTS.filter((sl) => !plan[sl.id]);
  if (ins.mostSkipped && missing.some((m) => m.id === ins.mostSkipped.id)) out.push(`Je slaat <b>${ins.mostSkipped.l.toLowerCase()}</b> het vaakst over — juist dat moment loont om te plannen. ${SLOT_TIPS[ins.mostSkipped.id] || ''}`);
  if (!plan.ontbijt) out.push('Ontbijtidee met eiwit en vezels: kwark of skyr met bessen en walnoten, of havermout met kefir.');
  if (c.recovery != null && c.recovery < 50) out.push('Je herstelscore is laag: houd morgen het eten simpel en zorg dat je het voorbereid hebt.');
  out.push('Plannen kan hier: typ bijvoorbeeld <b>morgen lunch: linzensoep</b>, of gebruik <b>Body → Voeding → Planning</b>.');
  return out.join('\n\n');
}

function foodsAnswer() {
  const both = FOODS.filter((f) => f.pe && f.ve).map((f) => `${f.e} ${f.l}`);
  const prot = FOODS.filter((f) => f.pe && !f.ve).map((f) => `${f.e} ${f.l}`);
  const fib = FOODS.filter((f) => f.ve && !f.pe).map((f) => `${f.e} ${f.l}`);
  return `Relatief veel <b>eiwit én vezels</b>: ${both.join(', ')} (ook noten en zaden).\nVooral <b>eiwit</b>: ${prot.join(', ')}, plus kefir en yoghurt.\nVooral <b>vezels</b>: ${fib.join(', ')}, plus groenten, bessen en walnoten.\n\nMakkelijke combinatie: kwark met havermout en bessen, of een linzensoep met volkorenbrood.`;
}

function waterAnswer(c) {
  const w = c.nutrition;
  return `Vandaag: <b>${w.today.water}</b> van ${w.last7Days.waterTarget} glazen.${w.last7Days.avgWater != null ? ` Gemiddeld deze week: ${nl1(w.last7Days.avgWater)} glazen (op ${periodSummary(lastDays(7)).waterDays} gelogde dagen).` : ''}\nTip: zet een fles of glas binnen handbereik — zien is drinken. Typ <b>water</b> om een glas toe te voegen.`;
}

function weekReport(c) {
  const w = c.nutrition.last7Days;
  const eatenMain = MAIN_SLOTS.reduce((a, sl) => a + w.perSlot[sl.id].eaten, 0);
  const skippedMain = MAIN_SLOTS.reduce((a, sl) => a + w.perSlot[sl.id].skipped, 0);
  const blocks = Object.entries(w.buildingBlocks).filter(([k, v]) => v && !['snelsuiker', 'cafeine'].includes(k)).map(([k, v]) => `${tagById(k).l.toLowerCase()} ${v}×`);
  const lines = ['<b>Weekrapport</b> (afgelopen 7 dagen)', ''];
  lines.push(`🍽️ <b>Voeding</b>: ${w.loggedDays ? `${eatenMain} hoofdmaaltijden gelogd, ${skippedMain} overgeslagen (${w.loggedDays} dagen ingevuld).${blocks.length ? ` Bouwstenen: ${blocks.join(', ')}.` : ''}${w.avgWater != null ? ` Water gem. ${nl1(w.avgWater)} glazen.` : ''}` : 'nog niets gelogd.'}`);
  lines.push(`🧠 <b>Mind</b>: ${c.avgMood7 != null ? `stemming ${nl1(c.avgMood7)}/5` : 'stemming niet gelogd'}${c.avgEnergy7 != null ? `, energie ${nl1(c.avgEnergy7)}/10` : ''}${c.avgFocus7 != null ? `, concentratie ${nl1(c.avgFocus7)}/10` : ''}.`);
  lines.push(`🌙 <b>Slaap</b>: ${c.avgSleep7 != null ? `gemiddeld ${nl1(c.avgSleep7)} uur (${c.sleepDays7} nachten, doel ${c.sleepTarget})` : 'niet gelogd'}.`);
  lines.push(`🏃 <b>Training</b>: ${c.trainingMin7} min in ${c.workouts7.length} sessies (doel ${c.trainingTarget}).`);
  const active = c.goals.filter((g) => g.progress < 100);
  if (active.length) lines.push(`🎯 <b>Doelen</b>: ${active.slice(0, 3).map((g) => `${escHtml(g.title)} ${g.progress}%`).join(' · ')}.`);
  const tips = [];
  const ins = allInsights(30);
  if (ins.mostSkipped) tips.push(`${ins.mostSkipped.l} plannen (${SLOT_TIPS[ins.mostSkipped.id]?.split(':')[0] || 'iets kleins telt ook'}).`);
  if (c.avgSleep7 != null && c.avgSleep7 < c.sleepTarget - 0.5) tips.push('Slaap is deze week de grootste hefboom: een vast bedtijdmoment proberen.');
  if (w.avgWater != null && w.avgWater < (w.waterTarget || 8) - 2) tips.push('Een glas water bij elke maaltijd.');
  if (!(w.buildingBlocks.omega3)) tips.push('Eén keer vette vis (of walnoten/lijnzaad) inplannen.');
  if (tips.length) lines.push('', '<b>Voor volgende week</b> (kies er één):', ...tips.slice(0, 3).map((x) => `• ${x}`));
  lines.push('', '<i>Patronen zijn samenhang, geen oorzaak.</i>');
  return lines.join('\n');
}

const HELP = `Ik ben <b>NEXUS Core</b> en draai in de pagina zelf — ook offline. Probeer:
• <b>samenvatting</b> — je dag in één oogopslag
• <b>hoe slaap ik?</b> / <b>stemming</b> / <b>training</b>
• <b>doelen</b> / <b>gewoontes</b> / <b>waar moet ik op focussen?</b>
• <b>prioriteit: …</b> — voegt een prioriteit toe
• <b>nieuw doel: …</b> — maakt een doel aan
• <b>klaar: …</b> — vinkt een prioriteit af
• <b>ontbijt: …</b> / <b>lunch: …</b> / <b>avondeten: …</b> / <b>snack: …</b> — logt een maaltijd
• <b>morgen lunch: …</b> — plant een maaltijd · <b>water</b> — glas erbij
• <b>weekrapport</b> / <b>wat heb ik deze week gegeten?</b> / <b>welke maaltijden sla ik over?</b>`;

/** "kwark met muesli 350 kcal 25g eiwit" → {name, kcal, protein, carbs, fat} */
export function parseMealText(txt) {
  let rest = ` ${txt} `;
  const grab = (re) => { const m = rest.match(re); if (!m) return 0; rest = rest.replace(m[0], ' '); return Number(m[1].replace(',', '.')); };
  const kcal = grab(/(\d+(?:[.,]\d+)?)\s*(?:kcal|cal|calorie[eë]n)\b/i);
  const protein = grab(/(\d+(?:[.,]\d+)?)\s*g(?:r(?:am)?)?\s*(?:eiwit(?:ten)?|prot(?:ein)?)\b/i);
  const carbs = grab(/(\d+(?:[.,]\d+)?)\s*g(?:r(?:am)?)?\s*(?:koolh\w*|carbs?)\b/i);
  const fat = grab(/(\d+(?:[.,]\d+)?)\s*g(?:r(?:am)?)?\s*(?:vet(?:ten)?|fat)\b/i);
  const name = rest.replace(/[,;·]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { name, kcal: kcal || Math.round(protein * 4 + carbs * 4 + fat * 9), protein, carbs, fat };
}

/** Vaste commando's werken bij elke provider, ook zonder internet. */
export function runCommand(raw) {
  let m = raw.match(/^(?:prioriteit|taak|todo|voeg toe)\s*[:\-]\s*(.+)$/i);
  if (m) { addPriority(m[1].trim()); return `Toegevoegd aan vandaag: <b>${escHtml(m[1].trim())}</b> ✓`; }
  m = raw.match(/^(?:nieuw doel|doel)\s*[:\-]\s*(.+)$/i);
  if (m) { addGoal(m[1].trim()); return `Doel aangemaakt: <b>${escHtml(m[1].trim())}</b>. Voeg onder Goals mijlpalen toe om voortgang te meten.`; }
  m = raw.match(/^morgen\s+(ontbijt|lunch|avondeten|avond|diner|snack|tussendoor)\s*[:\-]\s*(.+)$/i);
  if (m) { const sl = SLOT_WORDS[m[1].toLowerCase()]; setPlan(addDays(today(), 1), sl, m[2].trim()); return `Gepland voor morgen — ${slotById(sl).l.toLowerCase()}: <b>${escHtml(m[2].trim())}</b> 📅`; }
  m = raw.match(/^(ontbijt|lunch|avondeten|avond|diner|snack|tussendoor|tussendoortje)\s*[:\-]\s*(.+)$/i);
  if (m) {
    const sl = SLOT_WORDS[m[1].toLowerCase()];
    const text = m[2].trim();
    if (/^(overgeslagen|niet|geen|skip)$/i.test(text)) { skipSlot(today(), sl); return `${slotById(sl).l} gemarkeerd als overgeslagen.`; }
    logMeal(sl, text);
    const tags = detectTags(text).map((x) => tagById(x).e).join(' ');
    return `${slotById(sl).e} ${slotById(sl).l} gelogd: <b>${escHtml(text)}</b>${tags ? ` ${tags}` : ''}`;
  }
  m = raw.match(/^(?:gegeten|eten|maaltijd|at)\s*[:\-]\s*(.+)$/i);
  if (m) {
    const meal = parseMealText(m[1]);
    if (!meal.name) return 'Wat heb je gegeten? Bijvoorbeeld: <b>gegeten: broodje kip</b> (kcal en eiwit mogen erbij, hoeft niet).';
    const sl = slotForTime();
    logMeal(sl, meal.name, today(), { kcal: meal.kcal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat });
    const tot = nutritionTotals(today());
    return `${slotById(sl).e} ${slotById(sl).l} gelogd: <b>${escHtml(meal.name)}</b>${meal.kcal ? ` · ${meal.kcal} kcal (vandaag ${tot.kcal})` : ''}.`;
  }
  m = raw.match(/^(?:\+?\s*(\d+)\s*)?(?:glas|glazen)?\s*water(?:\s*\+?\s*(\d+))?$/i);
  if (m) { const n = Number(m[1] || m[2] || 1); setWater(today(), waterOn(today()) + n); return `💧 +${n} — vandaag ${waterOn(today())} glazen water.`; }
  m = raw.match(/^(?:klaar|af|done)\s*[:\-]\s*(.+)$/i);
  if (m) {
    const text = completePriority(m[1].trim());
    return text ? `Afgevinkt: <b>${escHtml(text)}</b> 🎯` : 'Ik vond geen open prioriteit die daarop lijkt.';
  }
  return null;
}

/**
 * NEXUS Core zonder standaardantwoord: geeft HTML terug, of null als er geen commando of
 * herkende vraag is. Zo kan het Kompas-gesprek het overnemen bij gewone gesprekszinnen.
 */
export function localCoreReply(message) {
    const raw = message.trim();
    const txt = raw.toLowerCase();
    const c = buildContext();
    const cmd = runCommand(raw);
    if (cmd) return cmd;

    if (has(txt, 'help', 'wat kun', 'wat kan je', 'commando')) return HELP;
    if (has(txt, 'weekrapport', 'week rapport', 'weekoverzicht', 'weekreview')) return weekReport(c);
    if (has(txt, 'sla ik', 'overgeslagen', 'overslaan', 'mis ik')) return skippedAnswer();
    if (has(txt, 'gegeten', 'heb ik geg', 'wat at ik')) return weekMeals(c);
    if (has(txt, 'regelmatig', 'eetritme', 'ritme', 'regelmaat')) return regularityAnswer();
    if (has(txt, 'patroon', 'patronen', 'verband', 'samenhang', 'valt op')) return patternsAnswer();
    if (has(txt, 'morgen') && has(txt, 'plan', ' eten', 'beter', 'maaltijd')) return planTomorrow(c);
    if (has(txt, 'eiwit', 'vezel', 'proteïne', 'proteine')) return foodsAnswer();
    if (has(txt, 'water', 'drinken', 'drink ik')) return waterAnswer(c);
    if (has(` ${txt}`, 'voeding', ' eten', 'maaltijd', 'ontbijt', 'lunch', 'avondeten')) return nutritionToday(c);
    if (has(txt, 'samenvat', 'overzicht', 'briefing')) return summary(c);
    if (has(txt, 'slaap', 'sliep', 'moe', 'nacht', 'bed')) return sleepAnswer(c);
    if (has(txt, 'stemming', 'voel', 'humeur', 'mood', 'energie', 'mentaal')) return moodAnswer(c);
    if (has(txt, 'train', 'sport', 'workout', 'gym', 'hardlo', 'herstel', 'beweg')) return trainingAnswer(c);
    if (has(txt, 'doel', 'project', 'goal', 'mijlpa')) return goalsAnswer(c);
    if (has(txt, 'gewoont', 'habit', 'streak', 'reeks')) return habitsAnswer(c);
    if (has(txt, 'focus', 'prioriteit', 'wat moet', 'waar moet', 'begin', 'taken')) return focusAnswer(c);
    if (has(txt, 'vandaag', 'status', 'hoe sta', 'mijn dag')) return summary(c);
    if (has(txt, 'hoi', 'hallo', 'hey', 'goedemorgen', 'goedemiddag', 'goedenavond')) return `Hey${c.name ? ' ' + escHtml(c.name) : ''}! Vraag me om een <b>samenvatting</b> of typ <b>help</b>.`;
    if (has(txt, 'dank', 'thanks', 'top')) return 'Graag gedaan. 💙';
    return null; // 'Daar heb ik (nog) geen antwoord op — NEXUS Core is een eenvoudige lokale assistent. Typ <b>help</b> voor wat ik kan, of kies <b>Claude</b> in de instellingen voor echte gesprekken.';
}

const CORE_FALLBACK = 'Daar heb ik (nog) geen antwoord op — NEXUS Core is een eenvoudige lokale assistent. Typ <b>help</b> voor wat ik kan, of kies <b>Claude</b> in de instellingen voor echte gesprekken.';

registerProvider({
  id: 'local',
  name: 'NEXUS Core',
  sub: 'Lokaal · regelgebaseerd · werkt offline',
  available: async () => true,
  async reply(message) {
    return localCoreReply(message) ?? CORE_FALLBACK;
  },
});

// =====================================================================
// Provider 2: Claude — via je eigen Claude-account (geen API-sleutel,
// geen extra kosten). Alleen beschikbaar als NEXUS als Claude-pagina draait.
// =====================================================================
let samplePromise = null;
function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      try {
        if (!window.claude || typeof window.claude.use !== 'function') return null;
        return await window.claude.use('sample');
      } catch (_) { return null; }
    })();
  }
  return samplePromise;
}
let claudeRefused = false;

/** Extra afspraken voor Claude, bovenop de vaste grenzen uit consent.js. Bewust zonder aannames over de gebruiker. */
const CLAUDE_EXTRA = [
  'Open Kompas: plaats de gebruiker niet in een hokje, schrijf geen identiteit, type of diagnose toe en stuur niet richting één levensdoel. Een vermoeden is een vraag, met ruimte voor andere verklaringen.',
  'Over voeding: praktisch en haalbaar, zonder te moraliseren (geen goed/slecht eten, geen strenge regels). Maak onderscheid tussen aangetoond, aannemelijk en onvoldoende onderzocht. Patronen in eigen gegevens zijn samenhang, geen oorzaak; noem het aantal dagen. Supplementen of bloedonderzoek: verwijs naar de huisarts.',
  'Je kunt acties uitvoeren met de tools (prioriteit, doel, maaltijd loggen of plannen, water). Doe dat alleen als de gebruiker daar duidelijk om vraagt, en bevestig kort wat je deed.',
].join('\n');

/** Zet Claude's markdown om naar veilige, simpele HTML. */
function mdToHtml(text) {
  return escHtml(text)
    .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, '$1<i>$2</i>')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

registerProvider({
  id: 'claude',
  name: 'Claude',
  sub: 'Via je Claude-account · alleen wat jij toestaat',
  external: true,
  host: CLAUDE_HOST,
  available: async () => !claudeRefused && !!(await getSample()),
  async reply(message, history, { onText } = {}) {
    const cmd = runCommand(message.trim());
    if (cmd) return cmd;
    // Vangnet (P0-3): zonder keuze van de gebruiker voor Claude gaat er niets naar buiten.
    if (!hasDecided(CLAUDE_HOST)) return 'Kies eerst wat Claude mag zien (knop <b>Wat mag de AI zien?</b>). Er is niets verstuurd.';
    const sample = await getSample();
    if (!sample) throw new Error('Claude is alleen beschikbaar als NEXUS als Claude-artifact draait');
    const req = buildAiRequest(message, history, grantedScopes(CLAUDE_HOST));
    const system = `${req.messages[0].content}
${CLAUDE_EXTRA}`;
    // De Claude-runtime kent geen system-rol: stuur de grenzen als eerste beurt mee.
    const messages = [{ role: 'user', content: system }, { role: 'assistant', content: 'Begrepen. Ik ben NEXUS.' }, ...req.messages.slice(1)];
    const clean = [];
    for (const m of messages) {
      if (clean.length && clean.at(-1).role === m.role) clean.at(-1).content += '\n\n' + m.content;
      else clean.push({ ...m });
    }
    logShare({ host: CLAUDE_HOST, ...req.shared });
    const tools = [
      { name: 'add_priority', description: 'Voeg een prioriteit toe aan de lijst van vandaag.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        execute: ({ text }) => { addPriority(String(text).slice(0, 120)); return { ok: true }; } },
      { name: 'add_goal', description: 'Maak een nieuw doel aan, optioneel met mijlpalen.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, milestones: { type: 'array', items: { type: 'string' } } }, required: ['title'] },
        execute: ({ title, milestones }) => { addGoal(String(title).slice(0, 80), (milestones || []).slice(0, 20).map((x) => String(x).slice(0, 100))); return { ok: true }; } },
      { name: 'log_meal', description: 'Log een maaltijd die de gebruiker vandaag (of op een eerdere datum) heeft gegeten. slot: ontbijt | lunch | diner | snack.', inputSchema: { type: 'object', properties: { slot: { type: 'string', enum: ['ontbijt', 'lunch', 'diner', 'snack'] }, text: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD, standaard vandaag' } }, required: ['slot', 'text'] },
        execute: ({ slot, text, date }) => { const d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') && date <= today() ? date : today(); logMeal(slot, String(text).slice(0, 140), d); return { ok: true, date: d }; } },
      { name: 'plan_meal', description: 'Plan een maaltijd voor een toekomstige dag. slot: ontbijt | lunch | diner | snack.', inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, slot: { type: 'string', enum: ['ontbijt', 'lunch', 'diner', 'snack'] }, text: { type: 'string' } }, required: ['date', 'slot', 'text'] },
        execute: ({ date, slot, text }) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date <= today()) return { ok: false, error: 'datum moet in de toekomst liggen (YYYY-MM-DD)' }; setPlan(date, slot === 'avond' ? 'diner' : slot, String(text)); return { ok: true }; } },
      { name: 'add_water', description: 'Voeg glazen water toe aan vandaag.', inputSchema: { type: 'object', properties: { glasses: { type: 'number' } }, required: ['glasses'] },
        execute: ({ glasses }) => { const n = Math.max(1, Math.min(10, Math.round(Number(glasses) || 1))); setWater(today(), waterOn(today()) + n); return { ok: true, total: waterOn(today()) }; } },
      { name: 'complete_priority', description: 'Vink een open prioriteit van vandaag af; geef (een deel van) de tekst.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        execute: ({ text }) => { const done = completePriority(String(text)); return done ? { ok: true, completed: done } : { ok: false, error: 'niet gevonden' }; } },
    ];
    try {
      const res = await sample(clean, {
        tools, // met tools geen 'cache'-optie (runtime-contract 0.2.96)
        onText: onText ? ({ text }) => onText(mdToHtml(text)) : undefined,
      });
      return mdToHtml(res.text || '(geen antwoord)');
    } catch (err) {
      if (err && err.code === 'not_granted') { claudeRefused = true; throw new Error('Geen toestemming voor Claude — ik schakel terug naar NEXUS Core'); }
      if (err && err.code === 'rate_limited') throw new Error('Even te veel vragen achter elkaar — probeer het zo opnieuw');
      throw new Error((err && err.message) || 'Onbekende fout');
    }
  },
});

// =====================================================================
// Provider 3: OpenAI-compatibel endpoint (optioneel, standaard uit).
// Werkt met elke server die /v1/chat/completions spreekt, bijvoorbeeld
// Ollama of LM Studio op je eigen computer — gratis, zonder abonnement.
// =====================================================================
registerProvider({
  id: 'openai-compatible',
  name: 'Eigen model (OpenAI-compatibel)',
  sub: 'Eigen server (bijv. Ollama) · alleen wat jij toestaat',
  needs: ['aiEndpoint', 'aiModel'],
  external: true,
  available: async () => true,
  async reply(message, history) {
    const s = getState().settings;
    if (!s.aiEndpoint || !s.aiModel) return 'Vul eerst het endpoint en de modelnaam in bij Instellingen → AI.';
    const host = endpointHost(s.aiEndpoint);
    if (!host) return 'Het endpoint is geen geldig adres. Controleer het bij Instellingen → AI.';
    // Vangnet: zonder keuze van de gebruiker voor déze server gaat er niets naar buiten.
    if (!hasDecided(host)) return 'Kies eerst wat de AI mag zien (knop <b>Wat mag de AI zien?</b>). Er is niets verstuurd.';
    const url = s.aiEndpoint.replace(/\/+$/, '') + (/\/chat\/completions$/.test(s.aiEndpoint) ? '' : '/chat/completions');
    const req = buildAiRequest(message, history, grantedScopes(host));
    logShare({ host, ...req.shared });
    const res = await fetch(url, {
      method: 'POST',
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...(s.aiKey ? { Authorization: `Bearer ${s.aiKey}` } : {}) },
      body: JSON.stringify({ model: s.aiModel, messages: req.messages, temperature: 0.6 }),
    });
    if (!res.ok) throw new Error(`Server antwoordde met ${res.status}`);
    const data = await res.json();
    return escHtml(data.choices?.[0]?.message?.content?.trim() || '(leeg antwoord)');
  },
});
