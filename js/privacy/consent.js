// NEXUS — toestemming voor externe AI en de gegevens die daarbij gedeeld worden.
//
// Uitgangspunten:
// - Alles staat standaard UIT. Zonder keuze van de gebruiker gaat er alleen het eigen bericht mee.
// - Toestemming geldt per categorie én per bestemming (host). Een andere server = opnieuw vragen.
// - Alleen velden die hieronder expliciet staan gaan mee (allowlist). Nieuwe velden in de app
//   gaan dus nooit vanzelf mee.
// - Gezondheidsmetingen alleen als gemiddelden; reflecties en namen van maaltijden nooit.
// - Elk verzoek wordt lokaal gelogd: tijd, bestemming en categorieën — nooit de inhoud.
import { buildKompasContext } from '../kompas/context.js';
import { getState, update, today, addDays, lastDays, prioritiesFor, habitsDoneOn, habitStreak, workoutMinutes, recoveryScore, goalProgress, nutritionTotals, mealsFor } from '../store.js';

/** Verhoog deze versie als de uitleg of de categorieën inhoudelijk veranderen: dan wordt opnieuw gevraagd. */
// v1.4: Claude als bestemming, concentratie bij stemming, eetritme en bouwstenen bij voeding.
export const CONSENT_TEXT_VERSION = '2026-11-v14k'; // + categorie "Mijn Kompas"
/** Bestemming als je Claude (via je Claude-account, in het artifact) als AI kiest. */
export const CLAUDE_HOST = 'claude.ai';
export const MAX_LOG = 200;
export const MAX_HISTORY = 10;

export const AI_CATEGORIES = [
  { id: 'profile', label: 'Je naam', desc: 'Alleen de naam uit Instellingen, voor de aanspreekvorm.' },
  { id: 'mood', label: 'Stemming, energie en concentratie', desc: 'Vandaag en gemiddelden over 7 dagen.' },
  { id: 'goals', label: 'Doelen en prioriteiten', desc: 'Titels, voortgang en volgende mijlpaal; prioriteiten van vandaag en open van gisteren.' },
  { id: 'habits', label: 'Gewoontes', desc: 'Namen, vandaag gedaan, reeks en dagen in de afgelopen week.' },
  { id: 'sleepHealth', label: 'Slaap en gezondheid', desc: 'Slaap vandaag en gemiddeld, herstelscore, en gemiddelde stappen, rusthartslag en HRV over 7 dagen. Geen waarden per dag.' },
  { id: 'training', label: 'Training', desc: 'Minuten en aantal trainingen in 7 dagen, en je weekdoel.' },
  { id: 'nutrition', label: 'Voeding en water', desc: 'Welke eetmomenten vandaag gegeten of overgeslagen zijn, bouwstenen (zoals eiwit en vezels) over 7 dagen, water, en — als je ze bijhoudt — kcal-totalen. Geen namen van maaltijden.' },
  { id: 'kompas', label: 'Mijn Kompas', desc: 'Wat je zelf in je kompas bewaarde (verteld, belangrijk, interesses, bevestigde inzichten). Onbevestigde vermoedens alleen gelabeld als onbevestigd. Nooit het archief.' },
  { id: 'history', label: 'Eerdere AI-gesprekken', desc: `De laatste ${MAX_HISTORY} berichten uit dit gesprek, als tekst.` },
];
export const CATEGORY_IDS = AI_CATEGORIES.map((c) => c.id);

/** Wat nooit wordt gedeeld, ook niet als alles aan staat. */
export const NEVER_SHARED = ['Reflecties en dagboekteksten', 'Gedachten-notities', 'Namen van maaltijden en je maaltijdplanning', 'Gezondheidsmetingen per dag', 'Archief van je kompas (verouderd, gecorrigeerd, gewist)', 'API-sleutel en andere instellingen'];

export const emptyScopes = () => Object.fromEntries(CATEGORY_IDS.map((id) => [id, false]));

/** Bestemming van het ingestelde endpoint, of '' als het geen geldige URL is. */
export function endpointHost(endpoint = getState().settings.aiEndpoint) {
  try { return new URL(String(endpoint)).host; } catch (_) { return ''; }
}

/** Bestemming van de gekozen AI: Claude of het ingestelde endpoint ('' bij NEXUS Core). */
export function activeHost(settings = getState().settings) {
  if (settings.aiProvider === 'claude') return CLAUDE_HOST;
  if (settings.aiProvider === 'openai-compatible') return endpointHost(settings.aiEndpoint);
  return '';
}

/** Heeft de gebruiker voor deze bestemming en deze versie van de uitleg al een keuze gemaakt? */
export function hasDecided(host = activeHost()) {
  const ai = getState().privacy?.ai;
  return !!ai && ai.textVersion === CONSENT_TEXT_VERSION && !!host && ai.host === host;
}

/** Categorieën die nu mogen. Zonder geldige keuze: geen enkele. */
export function grantedScopes(host = activeHost()) {
  if (!hasDecided(host)) return emptyScopes();
  const s = getState().privacy.ai.scopes || {};
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, s[id] === true]));
}

export function setConsent(scopes, host = activeHost()) {
  const now = new Date().toISOString();
  update((st) => {
    const prev = st.privacy.ai;
    st.privacy.ai = {
      textVersion: CONSENT_TEXT_VERSION,
      host,
      scopes: Object.fromEntries(CATEGORY_IDS.map((id) => [id, scopes?.[id] === true])),
      decidedAt: prev.host === host && prev.decidedAt ? prev.decidedAt : now,
      updatedAt: now,
    };
  });
}

/** Alles direct uit (de keuze "niets delen" blijft staan, zodat er niet opnieuw gevraagd wordt). */
export function revokeAll(host = activeHost()) { setConsent(emptyScopes(), host); }

export function logShare({ host, categories, historyCount }) {
  update((st) => {
    st.privacy.aiLog.unshift({ t: new Date().toISOString(), host: String(host), categories: [...categories], historyCount: Number(historyCount) || 0 });
    if (st.privacy.aiLog.length > MAX_LOG) st.privacy.aiLog.length = MAX_LOG;
  }, { silent: true });
}
export function clearLog() { update((st) => { st.privacy.aiLog = []; }); }

const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

/**
 * Context voor een extern model, alleen met toegestane categorieën.
 * Elk veld staat hier expliciet; niets wordt automatisch doorgegeven.
 */
export function buildScopedContext(scopes) {
  const s = getState();
  const t = today();
  const d7 = lastDays(7);
  const ctx = { datum: t };
  if (scopes.profile && s.settings.name) ctx.naam = s.settings.name;
  if (scopes.mood) {
    const m = s.moods[t];
    ctx.stemming = {
      vandaag: m ? { stemming_1_5: m.mood ?? null, energie_0_10: m.energy ?? null, concentratie_0_10: m.focus ?? null } : null,
      gemiddeld7dagen: {
        stemming_1_5: avg(d7.map((d) => s.moods[d]?.mood).filter((x) => x != null)),
        energie_0_10: avg(d7.map((d) => s.moods[d]?.energy).filter((x) => x != null)),
        concentratie_0_10: avg(d7.map((d) => s.moods[d]?.focus).filter((x) => x != null)),
      },
    };
  }
  if (scopes.goals) {
    ctx.prioriteiten = { vandaag: prioritiesFor(t).map((p) => ({ tekst: p.text, klaar: p.done })), openVanGisteren: prioritiesFor(addDays(t, -1)).filter((p) => !p.done).map((p) => p.text) };
    ctx.doelen = s.goals.map((g) => ({ titel: g.title, categorie: g.category, deadline: g.deadline || null, voortgangProcent: goalProgress(g), volgendeMijlpaal: g.milestones.find((m) => !m.done)?.text || null }));
  }
  if (scopes.habits) {
    ctx.gewoontes = s.habits.map((h) => ({ naam: h.name, vandaagGedaan: habitsDoneOn(t).includes(h.id), reeksDagen: habitStreak(h.id), dagenAfgelopenWeek: d7.filter((d) => habitsDoneOn(d).includes(h.id)).length }));
  }
  if (scopes.sleepHealth) {
    const sl = d7.map((d) => s.sleep[d]?.hours).filter((x) => x != null);
    const field = (f) => avg(d7.map((d) => s.health[d]?.[f]).filter((x) => x != null));
    ctx.slaapEnGezondheid = {
      slaapVannacht: s.sleep[t] ? { uren: s.sleep[t].hours, kwaliteit_1_5: s.sleep[t].quality } : null,
      gemiddeldeSlaap7dagen: avg(sl), nachtenGelogd: sl.length, slaapdoelUren: s.settings.sleepTarget,
      herstelscore_0_100: recoveryScore(t),
      gemiddeld7dagen: { stappen: field('steps'), rusthartslag: field('rhr'), hrvMs: field('hrv') },
    };
  }
  if (scopes.training) {
    ctx.training = { minuten7dagen: workoutMinutes(d7), aantal7dagen: s.workouts.filter((w) => d7.includes(w.date)).length, weekdoelMinuten: s.settings.weeklyTrainingTarget };
  }
  if (scopes.nutrition) {
    const n = nutritionTotals(t);
    // Status per eetmoment: gegeten / overgeslagen / niet ingevuld (geen namen).
    const slotState = (d, slot) => { const l = mealsFor(d).filter((x) => x.slot === slot); return l.some((x) => !x.skipped) ? 'gegeten' : l.some((x) => x.skipped) ? 'overgeslagen' : 'niet ingevuld'; };
    const blocks = {};
    for (const d of d7) for (const x of mealsFor(d)) if (!x.skipped) for (const tag of x.tags || []) blocks[tag] = (blocks[tag] || 0) + 1;
    ctx.voeding = {
      eetmomentenVandaag: Object.fromEntries(['ontbijt', 'lunch', 'diner'].map((sl) => [sl, slotState(t, sl)])),
      bouwstenen7dagen: blocks,
      dagenMetMaaltijden7dagen: d7.filter((d) => mealsFor(d).length).length,
      waterGlazenVandaag: s.water[t] || 0,
      waterdoelGlazen: s.settings.waterTarget,
    };
    if (s.settings.trackKcal) {
      ctx.voeding.kcal = {
        vandaag: { kcal: n.kcal, eiwitG: n.protein, koolhydratenG: n.carbs, vetG: n.fat },
        gemiddeld7dagen: avg(d7.map((d) => nutritionTotals(d).kcal).filter((x) => x > 0)),
        richtwaarden: { kcal: s.settings.kcalTarget, eiwitG: s.settings.proteinTarget },
      };
    }
  }
  if (scopes.kompas && s.kompas) {
    const k = buildKompasContext(s.kompas);
    ctx.mijnKompas = {
      uitleg: 'Voorlopige context die de gebruiker zelf bewaarde; geen vaststaande waarheid.',
      verteld: k.userToldMe.map((x) => x.text), belangrijk: k.userValues.map((x) => x.text), nieuwsgierigNaar: k.userInterests.map((x) => x.text),
      bevestigdeInzichten: k.confirmedByUser.map((x) => x.text), onbevestigd: k.openPossibilities.map((x) => `${x.text} (ONBEVESTIGD)`),
    };
  }
  return ctx;
}

/** Vaste grenzen voor elk extern model. */
export const SYSTEM_PROMPT = [
  'Je bent NEXUS, een korte, vriendelijke persoonlijke coach. Antwoord altijd in het Nederlands, beknopt en concreet.',
  'Je bent geen arts, therapeut of crisisdienst. Stel geen diagnoses, geef geen medicatie- of doseringsadvies en beoordeel geen behandelingen.',
  'Geef suggesties als keuze, niet als opdracht, en zonder oordeel of prestatiedruk.',
  'Bij signalen van acute nood of gedachten aan zelfdoding: reageer kort en warm en verwijs naar 113 Zelfmoordpreventie (0800-0113 of 113.nl), de huisarts of bij direct gevaar 112.',
  'Gebruik alleen de gegevens hieronder; vul niets aan over de gebruiker en zeg het als informatie ontbreekt.',
].join(' ');

const plain = (t) => String(t ?? '').replace(/<[^>]+>/g, '');

/**
 * Het volledige verzoek zoals het naar het model gaat — ook gebruikt voor de voorvertoning.
 * Geeft { messages, shared: { categories, historyCount } }.
 */
export function buildAiRequest(message, history = [], scopes = grantedScopes()) {
  const categories = CATEGORY_IDS.filter((id) => scopes[id] && id !== 'history');
  const ctx = buildScopedContext(scopes);
  const hist = scopes.history ? history.slice(-MAX_HISTORY).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: plain(m.text) })) : [];
  const system = categories.length
    ? `${SYSTEM_PROMPT}\nGegevens die de gebruiker heeft gekozen om te delen (JSON): ${JSON.stringify(ctx)}`
    : `${SYSTEM_PROMPT}\nDe gebruiker deelt geen persoonlijke gegevens; je kent alleen het bericht.`;
  return {
    messages: [{ role: 'system', content: system }, ...hist, { role: 'user', content: String(message) }],
    shared: { categories: scopes.history ? [...categories, 'history'] : categories, historyCount: hist.length },
  };
}
