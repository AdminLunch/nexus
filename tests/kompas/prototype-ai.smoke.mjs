// Rooktest: Open Kompas-gesprek via een NAGEBOOTSTE Claude (window.claude.use('sample') als testdubbel).
// Controleert toestemming vooraf, de lokale waarborgen op Claude-antwoorden en de terugval.
// Gebruik: python3 -m http.server 8080 & node tests/kompas/prototype-ai.smoke.mjs http://localhost:8080/prototype/open-kompas/
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/prototype/open-kompas/';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL' });
await ctx.addInitScript(() => {
  // Script per test: window.__plan = [antwoord-objecten of 'throw'], wordt per aanroep afgelopen.
  window.__calls = [];
  window.__plan = [];
  const sample = async (messages) => {
    window.__calls.push(JSON.stringify(messages));
    const next = window.__plan.length ? window.__plan.shift() : { reply: 'Vertel gerust verder.', move: 'listen', reflection: null, remember: [], options: [] };
    if (next === 'throw') throw Object.assign(new Error('nep-fout'), { code: 'rate_limited' });
    return { text: typeof next === 'string' ? next : 'Hier is mijn antwoord: ' + JSON.stringify(next) };
  };
  window.claude = { use: async (n) => (n === 'sample' ? sample : null) };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const calls = () => page.evaluate(() => window.__calls.length);
const plan = (arr) => page.evaluate((a) => { window.__plan = a; }, arr);
const lastNexus = () => page.locator('.row.nexus .msg').last().textContent();
const say = async (t) => { await page.fill('#input', t); await page.press('#input', 'Enter'); await page.waitForTimeout(250); };
const st = () => page.evaluate(() => window.KOMPAS_PROTO.state);

await page.goto(URL);
await page.waitForSelector('.consent-card');
check('Toestemmingskaart voor Claude verschijnt', (await page.locator('.consent-card').count()) === 1);
await say('Hoi, ik ben er');
check('Vóór toestemming: niets naar Claude', (await calls()) === 0);

await page.locator('[data-ai="on"]').click();
await plan([{ reply: 'Wat leuk! Waar ben je de laatste tijd mee bezig?', move: 'listen', reflection: null, remember: [{ type: 'interest', text: 'tekenen' }], options: ['Ik teken veel', 'Werk eigenlijk'] }]);
await say('Ik ben laatst begonnen met tekenen');
check('Claude-antwoord getoond', /Wat leuk/.test(await lastNexus()));
check('Eén aanroep, met bericht en Open Kompas-regels', (await calls()) === 1 && (await page.evaluate(() => window.__calls[0])).includes('begonnen met tekenen') && (await page.evaluate(() => window.__calls[0])).includes('Open Kompas'));
check('Snelkeuzes van Claude als kaarten', (await page.locator('#context-actions .card-btn', { hasText: 'Ik teken veel' }).count()) === 1);
check('Bewaarvoorstel, niets automatisch bewaard', (await page.locator('.proposal').count()) === 1 && (await st()).memory.entries.length === 0);

await plan([{ reply: 'Je bent gewoon een perfectionist type.', move: 'listen', reflection: null, remember: [], options: [] }, { reply: 'Klinkt alsof je daar veel aandacht in stopt. Wat teken je het liefst?', move: 'deepen', reflection: null, remember: [], options: [] }]);
await page.locator('#context-actions .card-btn', { hasText: 'Ik teken veel' }).click();
await page.waitForTimeout(250);
check('Label van Claude geweigerd en opnieuw gevraagd', !/perfectionist/.test(await lastNexus()) && /teken je het liefst/.test(await lastNexus()) && (await calls()) === 3);

await plan([{ reply: 'Diep van binnen ben je bang om te falen.', move: 'listen' }, { reply: 'Het komt doordat je onzeker bent.', move: 'listen' }]);
await say('Soms vind ik het lastig om te beginnen');
check('Twee keer fout → lokale terugval', (await page.locator('.row.nexus').last().textContent()).includes('lokale terugval') && !/onzeker bent|Diep van binnen/.test(await lastNexus()));

await plan([{ reply: 'Dat herken ik wel van meer mensen: zondagavond kan zwaar voelen.', move: 'listen', reflection: { text: 'Misschien hangt de onrust samen met het einde van het weekend?', alternatives: ['Het kan ook met je slaap te maken hebben.'] }, remember: [], options: [] }]);
await page.evaluate(() => { window.KOMPAS_PROTO.state.sinceReflection = 9; });
await say('Vooral op zondagavond voel ik me onrustig');
check('Mogelijk verband als 💡-kaart met alternatief', (await page.locator('.row.nexus.reflect').count()) === 1 && /Of misschien/.test(await page.locator('.row.nexus.reflect').last().textContent()));
await page.locator('#context-actions .card-btn', { hasText: 'Misschien' }).click();
await page.waitForTimeout(200);
check('"Misschien" → onbevestigd in kompas', (await st()).memory.entries.some((e) => e.type === 'possible'));

const before = await calls();
await say('Soms wil ik niet meer leven');
check('Veiligheidssignaal: vaste lokale reactie, niets naar Claude', /0800-0113/.test(await lastNexus()) && (await calls()) === before);

await plan(['throw']);
await say('Wat zal ik vanavond koken?');
check('Claude-fout → lokale terugval, geen JS-fout', (await page.locator('.row.nexus').last().textContent()).includes('lokale terugval'));

await page.locator('#ai-toggle').click();
const c2 = await calls();
await say('Nog een vraag');
check('Claude uit → weer lokaal, niets verstuurd', (await calls()) === c2);
check('Geen JavaScript-fouten', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} geslaagd`);
process.exit(results.every(Boolean) ? 0 : 1);
