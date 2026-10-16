// Rooktest voor NEXUS in iPhone-emulatie.
// Gebruik: start een server in de projectmap (python3 -m http.server 8080)
// en run: node tests/smoke.mjs [url] [screenshot-map]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const state = () => page.evaluate(() => window.NEXUS.getState());
const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }).catch(() => null);

await page.goto(URL);
await page.waitForSelector('.page-title');
const tKey = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
check('App laadt met home-scherm', await page.locator('.tab.active[data-tab="home"]').count() === 1);
await page.waitForTimeout(900);
await shot('01-home-leeg');

// --- Prioriteiten ---
for (const t of ['Offerte afronden', 'Sporten', 'Boodschappen']) {
  await page.fill('#prio-form .input', t);
  await page.press('#prio-form .input', 'Enter');
}
check('3 prioriteiten toegevoegd', (await page.locator('#prio-list .check-item').count()) === 3);
check('Invoerveld houdt focus na toevoegen', await page.evaluate(() => document.activeElement?.matches('#prio-form .input')));
await page.locator('#prio-list .check-item').first().locator('[data-act="toggle"]').click();
check('Prioriteit afvinken', (await page.locator('#prio-list .check-item.done').count()) === 1);
const score1 = await page.locator('.hero .ring-label b').textContent();
check('Dagscore reageert', Number(score1) > 0, `score ${score1}`);

// --- Snelle check-in + gewoonte-chip ---
await page.locator('#quick-mood [data-mood="4"]').click();
check('Stemming via check-in', (await state()).moods[tKey]?.mood === 4);
await page.locator('#habit-chips [data-habit="h-water"]').click();
check('Gewoonte via home-chip', (await state()).habitLog[tKey]?.includes('h-water'));

// --- Persistentie ---
await page.reload();
await page.waitForSelector('#prio-list');
check('Gegevens blijven na herladen', (await page.locator('#prio-list .check-item').count()) === 3 && (await page.locator('#prio-list .check-item.done').count()) === 1);

// --- Mind ---
await page.locator('.tab[data-tab="mind"]').click();
await page.waitForSelector('#mood-scale');
check('Navigatie naar Mind', await page.locator('.tab.active[data-tab="mind"]').count() === 1 && page.url().endsWith('#/mind'));
check('Stemming zichtbaar geselecteerd', await page.locator('#mood-scale button.on[data-mood="4"]').count() === 1);
await page.locator('#energy').fill('8');
await page.locator('#energy').dispatchEvent('change');
check('Energie-slider slaat op', (await state()).moods[tKey]?.energy === 8);
await page.fill('#reflection', 'Goede dag, veel gedaan.');
await page.waitForTimeout(900);
check('Reflectie automatisch opgeslagen', (await state()).reflections[tKey] === 'Goede dag, veel gedaan.');
await page.locator('#habit-list [data-habit="h-read"]').click();
check('Gewoonte afvinken in Mind', (await state()).habitLog[tKey]?.includes('h-read'));
check('Trendgrafiek getekend', await page.locator('section[aria-label="Trend"] svg .line').count() === 1);
await page.click('#manage');
await page.fill('#habit-form .input', 'Koud douchen');
await page.press('#habit-form .input', 'Enter');
check('Gewoonte toevoegen', (await state()).habits.some((h) => h.name === 'Koud douchen'));
await page.locator('.sheet [data-close]').click();
await page.waitForTimeout(400);
await shot('02-mind');

// --- Body ---
await page.locator('.tab[data-tab="body"]').click();
await page.waitForSelector('#save-sleep');
await page.locator('[data-step="-0.25"]').click();
await page.locator('[data-step="-0.25"]').click();
await page.locator('#sleep-q [data-q="4"]').click();
await page.click('#save-sleep');
const sl = (await state()).sleep[tKey];
check('Slaap opslaan (stepper + kwaliteit)', sl?.hours === 7 && sl?.quality === 4, JSON.stringify(sl));
const rec = await page.locator('.readiness .ring-label b').textContent();
check('Herstelscore berekend', Number(rec) > 0, `herstel ${rec}`);
await page.click('#add-workout');
await page.locator('#w-type [data-t="Hardlopen"]').click();
await page.locator('[data-m="5"]').click();
await page.locator('#w-int [data-i="4"]').click();
await page.click('#w-save');
await page.waitForTimeout(400);
const w = (await state()).workouts.at(-1);
check('Training toevoegen', w?.type === 'Hardlopen' && w?.minutes === 50 && w?.intensity === 4, JSON.stringify(w));
check('Training in lijst', (await page.locator('#workout-list .list-row').count()) === 1);
await shot('03-body');

// --- Goals ---
await page.locator('.tab[data-tab="goals"]').click();
await page.click('#new-goal');
await page.fill('#g-title', 'Halve marathon');
await page.fill('#g-why', 'Fitter worden');
await page.locator('#g-cat [data-c="Gezondheid"]').click();
await page.fill('#g-ms', 'Inschrijven\n10 km lopen\nRace');
await page.locator('#goal-form button.block').click();
await page.waitForTimeout(400);
const g = (await state()).goals[0];
check('Doel met mijlpalen aanmaken', g?.title === 'Halve marathon' && g.milestones.length === 3 && g.category === 'Gezondheid');
await page.locator('.goal .check-item').first().locator('[data-act="ms-toggle"]').click();
check('Mijlpaal afvinken → 33%', (await page.locator('.goal .pct').first().textContent()) === '33%');
await page.fill('.goal [data-act="ms-add"] .input', 'Nieuwe schoenen');
await page.press('.goal [data-act="ms-add"] .input', 'Enter');
check('Mijlpaal toevoegen', (await state()).goals[0].milestones.length === 4);
await page.locator('#filters [data-f="Werk"]').click();
check('Categoriefilter', (await page.locator('#goal-list .goal').count()) === 0);
await page.locator('#filters [data-f="Alle"]').click();
await shot('04-goals');

// --- AI ---
await page.locator('.tab[data-tab="ai"]').click();
await page.locator('#suggest [data-q="Samenvatting"]').click();
await page.waitForSelector('.msg.bot:not(.typing) >> nth=1', { timeout: 4000 }).catch(() => {});
await page.waitForTimeout(700);
const botText = await page.locator('.msg.bot').last().textContent();
check('AI-samenvatting', botText.includes('Dagscore'), botText.slice(0, 60));
await page.fill('#composer .input', 'prioriteit: Mail beantwoorden');
await page.press('#composer .input', 'Enter');
await page.waitForTimeout(900);
check('AI-commando voegt prioriteit toe', (await state()).priorities[tKey].some((p) => p.text === 'Mail beantwoorden'));
await page.fill('#composer .input', 'hoe slaap ik?');
await page.press('#composer .input', 'Enter');
await page.waitForTimeout(900);
check('AI-slaapvraag', (await page.locator('.msg.bot').last().textContent()).includes('uur'));
await shot('05-ai');

// --- Instellingen, export, demo ---
await page.click('#btn-settings');
await page.fill('#st-name', 'Leeroy');
await page.locator('#settings-form button.block').click();
check('Naam opslaan', (await state()).settings.name === 'Leeroy');
await page.click('#btn-settings');
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('#st-export')]);
let exportOk = false;
if (download) { const p = await download.path(); const fs = await import('node:fs'); exportOk = JSON.parse(fs.readFileSync(p, 'utf8')).data.goals.length === 1; }
check('Back-up exporteren', exportOk);
if (download) {
  const p = await download.path();
  await page.evaluate(() => { localStorage.clear(); });
  await page.setInputFiles('#st-import', p);
  await page.waitForTimeout(300);
  check('Back-up herstellen', (await state()).goals.length === 1);
}
await page.click('#btn-settings');
await page.click('#st-demo');
await page.waitForTimeout(300);
check('Demo-data laden', (await state()).workouts.length > 10);
await page.goto(URL + '#/home');
await page.waitForTimeout(1200);
await shot('06-home-demo');
await page.goto(URL + '#/mind'); await page.waitForTimeout(1300); await shot('07-mind-demo');
await page.goto(URL + '#/body'); await page.waitForTimeout(1300); await shot('08-body-demo');
await page.goto(URL + '#/goals'); await page.waitForTimeout(1000);
await page.locator('.goal [data-act="expand"]').first().click(); await page.waitForTimeout(500); await shot('09-goals-demo');

// --- Layout & PWA ---
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check('Geen horizontale scroll', !overflow);
const navFixed = await page.evaluate(() => { const r = document.querySelector('.tabbar').getBoundingClientRect(); return getComputedStyle(document.querySelector('.tabbar')).position === 'fixed' && r.bottom <= window.innerHeight; });
check('Tabbar vast onderaan', navFixed);
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
check('Service worker geregistreerd', sw);
const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('Manifest geldig', manifest.display === 'standalone' && manifest.icons.length >= 2);

// offline
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.reload().catch(() => {});
const offlineOk = await page.locator('.page-title').count().catch(() => 0);
check('Werkt offline', offlineOk > 0);
await ctx.setOffline(false);

check('Geen JavaScript-fouten', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
