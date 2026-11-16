// Rooktest voor het Open Kompas-prototype (synthetische invoer).
// Gebruik: start een server in de projectmap (python3 -m http.server 8080)
// en run: node tests/kompas/prototype.smoke.mjs [url] [screenshot-map]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/prototype/open-kompas/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
const page = await ctx.newPage();
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => requests.push(r.url()));
page.on('dialog', (d) => { errors.push('native dialoog gebruikt: ' + d.type()); d.dismiss(); });
const dlg = async (text) => { if (text != null) await page.fill('#dlg-input', text); await page.locator('.dialog [data-r="1"]').click(); await page.waitForTimeout(150); };
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const st = () => page.evaluate(() => window.KOMPAS_PROTO.state);
const lastNexus = () => page.locator('.msg.nexus').last().textContent();
const say = async (t) => { await page.fill('#input', t); await page.press('#input', 'Enter'); };
const core = (id) => page.locator(`[data-core="${id}"]`).click();

await page.goto(URL);
await page.waitForSelector('.msg.nexus');
check('Prototype laadt met open kennismaking', /niets in te vullen/.test(await lastNexus()));
check('Zes vaste keuzes zichtbaar', (await page.locator('#core-actions .chip').count()) === 6);
check('Kennismaking biedt "Ik weet het nog niet"', (await page.locator('#context-actions .chip', { hasText: 'Ik weet het nog niet' }).count()) === 1);
await shot('k01-start');

await say('Ik voel me vaak onrustig de laatste tijd');
await say('Die onrust voel ik vooral op zondagavond');
check('Mogelijk verband als vraag voorgelegd', /vraag me af/i.test(await lastNexus()) && (await page.locator('.msg.reflect').count()) === 1);
await shot('k02-reflectie');
await page.locator('#context-actions .chip', { hasText: 'Misschien' }).click();
check('"Misschien" bewaart als onbevestigd', (await page.locator('.item.possible .label').count()) === 1);

await core('switch');
check('Over iets heel anders', /laten we los/.test(await lastNexus()));
await say('Ik vind het leuk om te tekenen, vooral vogels');
check('Bewaarvoorstel verschijnt (niet automatisch opgeslagen)', (await page.locator('.proposal').count()) === 1 && (await st()).memory.entries.length === 1);
await page.locator('[data-accept="0"]').click();
check('Onthouden na klik', (await st()).memory.entries.some((e) => e.type === 'interest'));

await core('skip');
check('Vraag overslaan', /laat ik liggen/.test(await lastNexus()));
await core('practical');
check('Praktisch via knop neemt niets aan, biedt hoogstens aan', /Wat wil je precies geregeld/.test(await lastNexus()));
await say('Ik moet mijn verhuizing regelen maar weet niet waar te beginnen');
await page.waitForFunction(() => document.querySelectorAll('.msg.nexus').length && /geprobeerd/.test([...document.querySelectorAll('.msg.nexus')].at(-1).textContent));
check('Praktische modus zonder duiding', (await page.locator('.msg.nexus').last().getAttribute('data-move')) === 'practical');

// Regie in Mijn Kompas
await page.locator('.item.possible [data-op="correct"]').click();
await dlg('Synthetische correctie: het rooster is gewoon slecht');
const s1 = await st();
check('"Klopt niet" archiveert en bewaart eigen woorden', s1.memory.entries.some((e) => e.status === 'corrected') && s1.memory.entries.some((e) => e.type === 'told' && /rooster/.test(e.text)));
await page.locator('.item:not(.archived) [data-op="remove"]').first().click();
check('Wissen haalt inhoud weg', (await st()).memory.entries.some((e) => e.status === 'deleted' && !('text' in e)));

await page.locator('#btn-demo').click();
await page.locator('#btn-new-session').click();
check('Vervolgsessie vraagt of iets oud nog klopt', /Klopt dat nog/.test(await lastNexus()));
await page.locator('#context-actions .chip', { hasText: 'Niet meer' }).click();
check('Herijking → verouderd', (await st()).memory.entries.some((e) => e.status === 'outdated'));

await say('Soms wil ik niet meer leven');
check('Veiligheidsverwijzing 113', /0800-0113/.test(await lastNexus()));

await page.locator('#guard-panel').evaluate((d) => { d.open = true; });
check('AI-context toont ONBEVESTIGD-label', /ONBEVESTIGD/.test(await page.locator('#guard-info pre').textContent()));
await shot('k03-kompas');

await page.locator('#btn-wipe').click();
await dlg();
check('Alles wissen', (await st()).memory.entries.length === 0);

const external = requests.filter((u) => !u.startsWith(new globalThis.URL(URL).origin));
check('Geen externe netwerkverzoeken', external.length === 0, external.join(', '));
check('Geen opslag in localStorage', await page.evaluate(() => localStorage.length === 0));
check('Geen JS-fouten', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
