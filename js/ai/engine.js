// NEXUS AI — uitbreidbare assistent-module.
//
// Een "provider" is een object met:
//   id:    unieke sleutel
//   name:  weergavenaam
//   needs: optionele lijst instellingen die nodig zijn (bijv. ['aiEndpoint'])
//   reply: async (bericht, context) => string
//
// Nieuwe provider toevoegen? Maak een bestand in js/ai/ en roep registerProvider() aan
// (zie het voorbeeld 'openai-compatible' onderaan).

import { getState, update, today, addDays, lastDays, prioritiesFor, habitsDoneOn, habitStreak, workoutMinutes, recoveryScore, dayScore, goalProgress, uid } from '../store.js';

const providers = new Map();
export function registerProvider(p) { providers.set(p.id, p); }
export function getProviders() { return [...providers.values()]; }
export function activeProvider() {
  const id = getState().settings.aiProvider;
  return providers.get(id) || providers.get('local');
}

/** Compacte samenvatting van je data — context voor elke provider. */
export function buildContext() {
  const s = getState();
  const t = today();
  const d7 = lastDays(7);
  const sleep7 = d7.map((d) => s.sleep[d]?.hours).filter((x) => x != null);
  const mood7 = d7.map((d) => s.moods[d]?.mood).filter((x) => x != null);
  const energy7 = d7.map((d) => s.moods[d]?.energy).filter((x) => x != null);
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  return {
    date: t,
    name: s.settings.name,
    priorities: prioritiesFor(t),
    openYesterday: prioritiesFor(addDays(t, -1)).filter((p) => !p.done),
    moodToday: s.moods[t] || null,
    avgMood7: avg(mood7),
    avgEnergy7: avg(energy7),
    sleepToday: s.sleep[t] || null,
    avgSleep7: avg(sleep7),
    sleepDays7: sleep7.length,
    sleepTarget: s.settings.sleepTarget,
    trainingMin7: workoutMinutes(d7),
    trainingTarget: s.settings.weeklyTrainingTarget,
    workouts7: s.workouts.filter((w) => d7.includes(w.date)).length,
    health7: Object.fromEntries(d7.filter((d) => s.health?.[d]).map((d) => [d, s.health[d]])),
    recovery: recoveryScore(t),
    dayScore: dayScore(t),
    habits: s.habits.map((h) => ({ name: h.name, doneToday: habitsDoneOn(t).includes(h.id), streak: habitStreak(h.id), rate7: d7.filter((d) => habitsDoneOn(d).includes(h.id)).length })),
    goals: s.goals.map((g) => ({ title: g.title, category: g.category, deadline: g.deadline, progress: goalProgress(g), next: g.milestones.find((m) => !m.done)?.text || null })),
  };
}

// =====================================================================
// Provider 1: NEXUS Core — draait volledig lokaal, gratis, offline.
// Regelgebaseerd: herkent intenties en commando's en analyseert je data.
// =====================================================================
const has = (txt, ...words) => words.some((w) => txt.includes(w));

function summary(c) {
  const lines = [];
  const open = c.priorities.filter((p) => !p.done);
  lines.push(`<b>Dagscore ${c.dayScore}</b> — ${c.priorities.length ? `${c.priorities.length - open.length}/${c.priorities.length} prioriteiten klaar` : 'nog geen prioriteiten gezet'}.`);
  if (open.length) lines.push(`Volgende: <b>${esc(open[0].text)}</b>`);
  if (c.recovery != null) lines.push(`Herstel <b>${c.recovery}</b>/100 — ${c.recovery >= 70 ? 'ruimte voor een stevige training' : c.recovery >= 45 ? 'houd het gematigd' : 'focus op rust'}.`);
  else lines.push('Log je slaap voor een herstelscore.');
  const todoHabits = c.habits.filter((h) => !h.doneToday).map((h) => h.name);
  if (todoHabits.length) lines.push(`Gewoontes nog te doen: ${todoHabits.map(esc).join(', ')}.`);
  const urgent = c.goals.filter((g) => g.progress < 100 && g.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  if (urgent) lines.push(`Dichtstbijzijnde deadline: <b>${esc(urgent.title)}</b> (${urgent.progress}%)${urgent.next ? ` — volgende mijlpaal: ${esc(urgent.next)}` : ''}.`);
  return lines.join('\n');
}

function sleepAnswer(c) {
  if (!c.sleepDays7) return 'Ik heb nog geen slaapdata van de afgelopen week. Log je nachten onder <b>Body</b>, dan kan ik patronen zien.';
  const diff = Math.round((c.avgSleep7 - c.sleepTarget) * 10) / 10;
  let out = `Je sliep gemiddeld <b>${c.avgSleep7} uur</b> over ${c.sleepDays7} gelogde nachten (doel ${c.sleepTarget}u).`;
  if (diff < -0.75) out += `\nDat is ${Math.abs(diff)} uur per nacht te weinig. Tip: zet een vaste "schermen uit"-tijd 45 min voor bed en houd je opstaantijd gelijk, ook in het weekend.`;
  else if (diff < 0) out += '\nNet onder je doel. Een kwartier eerder naar bed maakt al verschil.';
  else out += '\nJe zit op of boven je doel — goed bezig. Let nu vooral op regelmaat.';
  return out;
}

function moodAnswer(c) {
  if (c.avgMood7 == null) return 'Er is nog geen stemming gelogd deze week. Een check-in kost 3 seconden — op Home of onder <b>Mind</b>.';
  let out = `Gemiddelde stemming deze week: <b>${c.avgMood7}/5</b>, energie <b>${c.avgEnergy7 ?? '—'}/10</b>.`;
  if (c.avgSleep7 != null && c.avgSleep7 < c.sleepTarget - 0.5 && c.avgMood7 < 3.5) out += '\nJe slaap ligt onder je doel en je stemming is wat lager — die twee hangen vaak samen. Begin bij slaap.';
  if (c.trainingMin7 < 60 && c.avgMood7 < 3.5) out += '\nWeinig beweging deze week. Een wandeling van 20 minuten buiten is een snelle stemmingsboost.';
  if (c.avgMood7 >= 4) out += '\nSterke week. Schrijf in je reflectie op wat er goed ging, zodat je het kunt herhalen.';
  return out;
}

function trainingAnswer(c) {
  const pct = Math.round((c.trainingMin7 / (c.trainingTarget || 150)) * 100);
  let out = `Afgelopen 7 dagen: <b>${c.trainingMin7} min</b> in ${c.workouts7} trainingen (${pct}% van je doel van ${c.trainingTarget} min).`;
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
  return 'Je actieve doelen:\n' + active.map((g) => `• <b>${esc(g.title)}</b> — ${g.progress}%${g.next ? ` · volgende: ${esc(g.next)}` : ''}`).join('\n');
}

function habitsAnswer(c) {
  if (!c.habits.length) return 'Je hebt nog geen gewoontes. Voeg ze toe onder <b>Mind → Beheren</b>.';
  const best = [...c.habits].sort((a, b) => b.rate7 - a.rate7)[0];
  const worst = [...c.habits].sort((a, b) => a.rate7 - b.rate7)[0];
  let out = c.habits.map((h) => `• ${esc(h.name)}: ${h.rate7}/7 dagen${h.streak ? ` · 🔥 ${h.streak}` : ''}${h.doneToday ? ' ✓' : ''}`).join('\n');
  if (best !== worst) out += `\n\nSterkst: <b>${esc(best.name)}</b>. Meeste ruimte: <b>${esc(worst.name)}</b> — koppel die aan iets wat je al dagelijks doet (na het tandenpoetsen, bij de koffie).`;
  return out;
}

function focusAnswer(c) {
  const open = c.priorities.filter((p) => !p.done);
  if (!c.priorities.length) {
    if (c.openYesterday.length) return `Je hebt nog geen prioriteiten voor vandaag. Van gisteren staat nog open: <b>${esc(c.openYesterday[0].text)}</b>. Begin daar mee?`;
    return 'Nog geen prioriteiten. Kies er maximaal drie: wat maakt vandaag geslaagd? Zeg bijvoorbeeld <b>prioriteit: offerte afmaken</b>.';
  }
  if (!open.length) return 'Alle prioriteiten zijn af. 🎯 Tijd voor rust, of pak één mijlpaal van een doel op.';
  return `Focus nu op: <b>${esc(open[0].text)}</b>.\nZet een timer van 25–50 minuten, telefoon in een andere kamer, en doe alleen dit.`;
}

const HELP = `Ik ben <b>NEXUS Core</b> en draai volledig op je toestel — gratis en offline. Probeer:
• <b>samenvatting</b> — je dag in één oogopslag
• <b>hoe slaap ik?</b> / <b>stemming</b> / <b>training</b>
• <b>doelen</b> / <b>gewoontes</b> / <b>waar moet ik op focussen?</b>
• <b>prioriteit: …</b> — voegt een prioriteit toe
• <b>nieuw doel: …</b> — maakt een doel aan
• <b>klaar: …</b> — vinkt een prioriteit af`;

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

registerProvider({
  id: 'local',
  name: 'NEXUS Core (lokaal)',
  needs: [],
  async reply(message) {
    const raw = message.trim();
    const txt = raw.toLowerCase();
    const c = buildContext();

    // --- commando's ---
    let m = raw.match(/^(?:prioriteit|taak|todo|voeg toe)\s*[:\-]\s*(.+)$/i);
    if (m) {
      update((st) => { (st.priorities[today()] ||= []).push({ id: uid(), text: m[1].trim(), done: false }); });
      return `Toegevoegd aan vandaag: <b>${esc(m[1].trim())}</b> ✓`;
    }
    m = raw.match(/^(?:nieuw doel|doel)\s*[:\-]\s*(.+)$/i);
    if (m) {
      update((st) => { st.goals.push({ id: uid(), title: m[1].trim(), why: '', category: 'Persoonlijk', deadline: '', milestones: [], createdAt: today() }); });
      return `Doel aangemaakt: <b>${esc(m[1].trim())}</b>. Voeg onder Goals mijlpalen toe om voortgang te meten.`;
    }
    m = raw.match(/^(?:klaar|af|done)\s*[:\-]\s*(.+)$/i);
    if (m) {
      const q = m[1].trim().toLowerCase();
      const p = prioritiesFor(today()).find((x) => !x.done && x.text.toLowerCase().includes(q));
      if (!p) return 'Ik vond geen open prioriteit die daarop lijkt.';
      update((st) => { st.priorities[today()].find((x) => x.id === p.id).done = true; });
      return `Afgevinkt: <b>${esc(p.text)}</b> 🎯`;
    }

    // --- vragen ---
    if (has(txt, 'help', 'wat kun', 'wat kan je', 'commando')) return HELP;
    if (has(txt, 'samenvat', 'overzicht', 'briefing')) return summary(c);
    if (has(txt, 'slaap', 'sliep', 'moe', 'nacht', 'bed')) return sleepAnswer(c);
    if (has(txt, 'stemming', 'voel', 'humeur', 'mood', 'energie', 'mentaal')) return moodAnswer(c);
    if (has(txt, 'train', 'sport', 'workout', 'gym', 'hardlo', 'herstel', 'beweg')) return trainingAnswer(c);
    if (has(txt, 'doel', 'project', 'goal', 'mijlpa')) return goalsAnswer(c);
    if (has(txt, 'gewoont', 'habit', 'streak', 'reeks')) return habitsAnswer(c);
    if (has(txt, 'focus', 'prioriteit', 'wat moet', 'waar moet', 'begin', 'taken')) return focusAnswer(c);
    if (has(txt, 'samenvat', 'overzicht', 'vandaag', 'status', 'hoe sta', 'briefing', 'mijn dag')) return summary(c);
    if (has(txt, 'hoi', 'hallo', 'hey', 'goedemorgen', 'goedemiddag', 'goedenavond')) return `Hey${c.name ? ' ' + esc(c.name) : ''}! Vraag me om een <b>samenvatting</b> of typ <b>help</b>.`;
    if (has(txt, 'dank', 'thanks', 'top')) return 'Graag gedaan. 💙';
    return `Daar heb ik (nog) geen antwoord op — NEXUS Core is een lokale, regelgebaseerde assistent. Typ <b>help</b> voor wat ik kan, of koppel een eigen AI-model in de instellingen.`;
  },
});

// =====================================================================
// Provider 2: OpenAI-compatibel endpoint (optioneel, standaard uit).
// Werkt met elke server die /v1/chat/completions spreekt, bijvoorbeeld
// Ollama of LM Studio op je eigen computer — gratis, zonder abonnement.
// =====================================================================
registerProvider({
  id: 'openai-compatible',
  name: 'Eigen model (OpenAI-compatibel)',
  needs: ['aiEndpoint', 'aiModel'],
  async reply(message, history) {
    const s = getState().settings;
    if (!s.aiEndpoint || !s.aiModel) return 'Vul eerst het endpoint en de modelnaam in bij Instellingen → AI.';
    const ctx = buildContext();
    const url = s.aiEndpoint.replace(/\/+$/, '') + (/\/chat\/completions$/.test(s.aiEndpoint) ? '' : '/chat/completions');
    const messages = [
      { role: 'system', content: `Je bent NEXUS, een beknopte persoonlijke coach. Antwoord altijd in het Nederlands, kort en concreet. Gegevens van de gebruiker (JSON): ${JSON.stringify(ctx)}` },
      ...history.slice(-10).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.replace(/<[^>]+>/g, '') })),
      { role: 'user', content: message },
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(s.aiKey ? { Authorization: `Bearer ${s.aiKey}` } : {}) },
      body: JSON.stringify({ model: s.aiModel, messages, temperature: 0.6 }),
    });
    if (!res.ok) throw new Error(`Server antwoordde met ${res.status}`);
    const data = await res.json();
    return esc(data.choices?.[0]?.message?.content?.trim() || '(leeg antwoord)');
  },
});
