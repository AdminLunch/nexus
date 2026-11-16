// Gegevensbehoud-test: de oorspronkelijke artifact-code (archiefbranch claude/artifact-snapshot-v1.2)
// slaat fictieve demo-gegevens op; daarna opent de verenigde versie dezelfde browseropslag.
// Gebruik: serveer een map met beide checkouts op één adres (zelfde origin = zelfde localStorage):
//   node tests/upgrade-from-artifact.mjs http://localhost:8094/nexus-artifact/ http://localhost:8094/nexus-unified/
import { chromium, devices } from 'playwright';

const [OLD, NEW] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(OLD);
await page.waitForSelector('.page-title');
// Fictieve gegevens via de eigen demo-functie van het artifact, plus een gedachte en een focus-only dag.
await page.evaluate(async () => {
  const store = await import('./js/store.js');
  store.loadDemo();
  store.update((st) => {
    st.thoughts.push({ id: 'fict1', date: '2026-01-05', t: 1, kind: 'idee', text: 'Fictieve gedachte' });
    st.moods['2026-01-05'] = { focus: 4 };
    st.settings.name = 'Fictief';
  });
});
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('nexus.v1')));
// Back-up zoals het oude artifact die maakt (onversleuteld JSON-bestand), voor de importtest verderop.
const oldBackup = await page.evaluate(async () => (await import('./js/store.js')).exportJSON());
check('Artifact-code schreef schema 2', before.schema === 2);

await page.goto(NEW);
await page.waitForSelector('.page-title');
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.NEXUS.getState());
const countMeals = (s) => Object.values(s.meals).reduce((n, l) => n + l.length, 0);
check('Schema bijgewerkt naar 3', after.schema === 3);
check('Alle maaltijden behouden', countMeals(after) === countMeals(before), `${countMeals(before)} → ${countMeals(after)}`);
check('Overgeslagen eetmomenten behouden', Object.values(after.meals).flat().filter((m) => m.skipped).length === Object.values(before.meals).flat().filter((m) => m.skipped).length);
check("Maaltijdtekst → name, 'avond' → 'diner'", Object.values(after.meals).flat().every((m) => m.skipped || typeof m.name === 'string') && !Object.values(after.meals).flat().some((m) => m.slot === 'avond'));
check('Bouwstenen (tags) behouden', JSON.stringify(Object.values(after.meals).flat().map((m) => m.tags || [])) === JSON.stringify(Object.values(before.meals).flat().map((m) => m.tags || [])));
check('Gedachten behouden', after.thoughts.length === before.thoughts.length && after.thoughts.some((t) => t.text === 'Fictieve gedachte'));
check('Concentratie zonder stemming blijft zonder stemming', JSON.stringify(after.moods['2026-01-05']) === '{"focus":4}');
check('Planning behouden', Object.keys(after.mealPlan).length === Object.keys(before.mealPlan).length);
check('Doelen, gewoontes, slaap, trainingen gelijk', ['goals', 'habits', 'sleep', 'workouts', 'priorities', 'water', 'reflections'].every((k) => JSON.stringify(after[k]) === JSON.stringify(before[k])));
check('Naam en instellingen behouden', after.settings.name === 'Fictief' && after.settings.waterTarget === before.settings.waterTarget);
check('Geen AI-toestemming vooraf (P0)', Object.keys(after.privacy.ai.scopes).length === 0);
check('Synchroniseren standaard uit', after.settings.cloudSync === false);
await page.goto(NEW + '#body');
await page.locator('#body-tabs [data-sub="voeding"]').click();
await page.waitForTimeout(300);
check('Voedingsscherm toont gemigreerde maaltijden', (await page.locator('.meal-item').count()) > 0 || (await page.locator('.slot-row[data-status]').count()) > 0);
// Back-up uit het oude artifact terugzetten via Instellingen › Herstellen (lege opslag)
{
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const file = path.join(os.tmpdir(), 'nexus-oud-artifact-fictief.json');
  fs.writeFileSync(file, oldBackup);
  await page.evaluate(() => localStorage.clear());
  await page.goto(NEW + '#home'); await page.reload(); await page.waitForSelector('.page-title');
  await page.click('#btn-settings');
  await page.setInputFiles('#st-import', file);
  await page.waitForTimeout(600);
  const restored = await page.evaluate(() => window.NEXUS.getState());
  check('Oude artifact-back-up terugzetten: alle maaltijden', countMeals(restored) === countMeals(before), `${countMeals(before)} → ${countMeals(restored)}`);
  check('Oude artifact-back-up: gedachten, planning, doelen, gewoontes, slaap, trainingen', restored.thoughts.length === before.thoughts.length && Object.keys(restored.mealPlan).length === Object.keys(before.mealPlan).length && ['goals', 'habits', 'sleep', 'workouts', 'priorities'].every((k) => JSON.stringify(restored[k]) === JSON.stringify(before[k])));
  check('Oude artifact-back-up: herstelpunt gemaakt vóór terugzetten', await page.evaluate(() => JSON.parse(localStorage.getItem('nexus.v1.restore') || '[]').length >= 1));
  fs.unlinkSync(file);
}
check('Geen JavaScript-fouten', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} geslaagd`);
process.exit(results.every(Boolean) ? 0 : 1);
