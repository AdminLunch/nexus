// Open Kompas-prototype — gesprekslaag via Claude (alleen in een Claude-artifact, alleen na toestemming).
// De regels en eindcontrole staan in js/kompas/aiturn.js (gedeeld met de NEXUS-app).
import { buildKompasContext } from '../../js/kompas/index.js';
import { buildTurnMessages, parseJson, checkTurn, choiceText } from '../../js/kompas/aiturn.js';

export { checkTurn, choiceText };

let samplePromise = null;
/** De sample-functie van de Claude-runtime, of null (niet in Claude, niet toegestaan of time-out). */
export function getSample() {
  if (!samplePromise) {
    samplePromise = (async () => {
      try {
        const end = Date.now() + 4000;
        while (!(window.claude && typeof window.claude.use === 'function') && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
        if (!window.claude?.use) return null;
        return await Promise.race([window.claude.use('sample'), new Promise((r) => setTimeout(() => r(null), 12000))]);
      } catch (_) { return null; }
    })();
  }
  return samplePromise;
}

export async function aiTurn(sample, { history, memory, reflectionAllowed, extraNote = '' }) {
  const ctx = buildKompasContext(memory);
  const context = `Voorlopige context uit "Mijn Kompas" (mag helpen, is geen waarheid):
${JSON.stringify({
    watDePersoonVertelde: ctx.userToldMe.map((x) => x.text),
    belangrijk: ctx.userValues.map((x) => x.text),
    nieuwsgierigNaar: ctx.userInterests.map((x) => x.text),
    bevestigdeInzichten: ctx.confirmedByUser.map((x) => x.text),
    onbevestigdeMogelijkheden: ctx.openPossibilities.map((x) => `${x.text} (ONBEVESTIGD)`),
  })}`;
  const res = await sample(buildTurnMessages({ context, history, reflectionAllowed, extraNote }), { modelTier: 'default' });
  return parseJson(res?.text);
}
