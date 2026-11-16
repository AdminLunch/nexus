// Rooktest voor NEXUS in iPhone-emulatie.
// Gebruik: start een server in de projectmap (python3 -m http.server 8080)
// en run: node tests/smoke.mjs [url] [screenshot-map]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// PW_CHROMIUM_PATH: optioneel pad naar een lokale Chromium (bijv. in een sandbox zonder download).
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
// Nep-klembord: zo testen we de gezondheidsimport zonder echte gegevens of systeemrechten.
await ctx.addInitScript(() => {
  const fake = { text: '', async readText() { return this.text; }, async writeText(t) { this.text = String(t); } };
  Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept());
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };
const state = () => page.evaluate(() => window.NEXUS.getState());
// Ringgetallen tellen 1,1 s op naar hun eindwaarde: wacht die animatie af voordat je leest.
// Wachten tot een voorwaarde in de pagina klopt. Niet page.waitForFunction: die gebruikt eval,
// en dat blokkeert de Content-Security-Policy van NEXUS terecht.
const waitUntil = async (fn, arg, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(100); }
  return false;
};
// Bevestigen in het eigen dialoogvenster (vervangt confirm(), dat in een Claude-artifact niet werkt).
const confirmDialog = async () => { await page.locator('.dialog [data-r="1"]').click(); await page.waitForTimeout(150); };
const ringValue = async (sel) => { await page.waitForTimeout(1300); return (await page.locator(sel).textContent()).trim(); };
const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }).catch(() => null);

await page.goto(URL);
await page.waitForSelector('.page-title');
const tKey = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
check('App opent op het Kompas (standaard startscherm)', await page.locator('.tab.active[data-tab="kompas"]').count() === 1 && (await page.locator('.kp-today').count()) === 1);
check('Home heet nu "Vandaag"', (await page.locator('.tab[data-tab="home"]').textContent()).includes('Vandaag'));
await page.locator('.kp-today [data-mood="3"]').click();
check('Stemming via Vandaag-strook in het Kompas', (await state()).moods[tKey]?.mood === 3);
await page.evaluate((k) => { delete window.NEXUS.getState().moods[k]; }, tKey); // terug naar 'nog niet gelogd' voor de Home-test
await page.locator('.kp-more').click();
await page.waitForSelector('#prio-form');
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
const score1 = await ringValue('.hero .ring-label b');
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
check('Navigatie naar Mind', await page.locator('.tab.active[data-tab="mind"]').count() === 1 && page.url().endsWith('#mind'));
check('Stemming zichtbaar geselecteerd', await page.locator('#mood-scale button.on[data-mood="4"]').count() === 1);
await page.locator('[data-metric="energy"]').fill('8');
await page.locator('[data-metric="energy"]').dispatchEvent('change');
check('Energie-slider slaat op', (await state()).moods[tKey]?.energy === 8);
await page.locator('[data-metric="focus"]').fill('6');
await page.locator('[data-metric="focus"]').dispatchEvent('change');
check('Concentratie-slider slaat op (artifact-functie)', (await state()).moods[tKey]?.focus === 6);
await page.fill('#thought-text', 'Fictief idee voor het weekend');
await page.click('#thought-save');
check('Gedachte vastleggen (artifact-functie)', (await state()).thoughts.some((x) => x.text === 'Fictief idee voor het weekend' && x.kind === 'idee'));
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
await page.waitForSelector('#body-tabs');
check('Body heeft onderdelen Herstel/Voeding/Inzichten/Kennis', (await page.locator('#body-tabs [data-sub]').count()) === 4);
await page.waitForSelector('#save-sleep');
await page.locator('[data-step="-0.25"]').click();
await page.locator('[data-step="-0.25"]').click();
await page.locator('#sleep-q [data-q="4"]').click();
await page.click('#save-sleep');
const sl = (await state()).sleep[tKey];
check('Slaap opslaan (stepper + kwaliteit)', sl?.hours === 7 && sl?.quality === 4, JSON.stringify(sl));
const rec = await ringValue('[data-ring="body-rec"] .ring-label b');
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

// --- Import Apple Gezondheid (synthetische meting) ---
{
  const y = new Date(Date.now() - 86400e3);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  await page.evaluate((t) => { navigator.clipboard.text = t; }, `NEXUS-HEALTH\nSTP|${yKey}|7321\nRHR|${yKey}|9999`);
  await page.click('#health-import');
  await page.waitForTimeout(400);
  const h = (await state()).health[yKey];
  check('Gezondheidsimport (onmogelijke waarde overgeslagen)', h?.steps === 7321 && h.rhr === undefined, JSON.stringify(h));
  check('Klembord leeg na import', (await page.evaluate(() => navigator.clipboard.text)) === '');
}

// --- Voeding: eetmomenten (standaard) + optioneel kcal ---
await page.locator('#body-tabs [data-sub="voeding"]').click();
await page.waitForSelector('.slots');
check('Calorieën staan standaard uit', (await page.locator('[data-ring="body-kcal"]').count()) === 0);
await page.locator('[data-skip="lunch"]').click();
check('Eetmoment overslaan', (await state()).meals[tKey]?.some((m) => m.slot === 'lunch' && m.skipped));
await page.click('#btn-settings');
await page.locator('#settings-form [name="trackKcal"]').check();
await page.locator('#settings-form button.block').click();
await page.waitForTimeout(300);
check('kcal bijhouden aanzetten', (await state()).settings.trackKcal === true && (await page.locator('[data-ring="body-kcal"]').count()) === 1);
await page.click('#add-meal');
await page.fill('#m-text', 'Kwark met muesli');
await page.locator('#m-slot [data-s="ontbijt"]').click();
await page.locator('.sheet details summary').click();
await page.fill('#m-kcal', '350');
await page.fill('#m-p', '25');
await page.click('#m-save');
await page.waitForTimeout(400);
let meals = ((await state()).meals[tKey] || []).filter((m) => !m.skipped);
check('Maaltijd loggen', meals.length === 1 && meals[0].kcal === 350 && meals[0].protein === 25 && meals[0].slot === 'ontbijt' && meals[0].name === 'Kwark met muesli', JSON.stringify(meals[0]));
check('Bouwstenen automatisch herkend', meals[0]?.tags?.includes('eiwit'), JSON.stringify(meals[0]?.tags));
await page.click('#add-meal');
await page.fill('#m-text', 'Broodje kip');
await page.locator('#m-slot [data-s="diner"]').click();
await page.locator('.sheet details summary').click();
await page.fill('#m-p', '30'); await page.fill('#m-c', '40'); await page.fill('#m-f', '10');
await page.click('#m-save');
await page.waitForTimeout(400);
meals = (await state()).meals[tKey].filter((m) => !m.skipped);
check('kcal uit macro\'s berekend', meals[1]?.kcal === 370, JSON.stringify(meals[1]));
await page.waitForTimeout(1300);
check('Voedingsring toont totaal', (await page.locator('[data-ring="body-kcal"] .ring-label b').textContent()).trim() === '720');
await page.click('#add-meal');
check('Snel opnieuw toont recente maaltijden', (await page.locator('#m-recent .chip').count()) === 2);
await page.locator('.sheet-backdrop').click();
await page.waitForTimeout(400);
await page.locator('.meal-item').first().click();
await page.click('#m-del');
await confirmDialog();
check('Maaltijd verwijderen', (await state()).meals[tKey].filter((m) => !m.skipped).length === 1);
await page.evaluate(() => { window.NEXUS.getState().habitLog = {}; });
for (let i = 0; i < 8; i++) await page.locator('#w-plus').click();
const st8 = await state();
check('Water bijhouden', st8.water[tKey] === 8);
check('Waterdoel vinkt gewoonte af', st8.habitLog[tKey]?.includes('h-water'));
await page.locator('[data-plan="ontbijt"]').fill('Havermout');
await page.locator('[data-plan="ontbijt"]').dispatchEvent('change');
check('Maaltijd plannen (artifact-functie)', Object.values((await state()).mealPlan).some((p) => p.ontbijt === 'Havermout'));
await page.locator('#body-tabs [data-sub="inzichten"]').click();
check('Inzichten tonen', (await page.locator('#body-sub .card').count()) > 0);
await page.locator('#body-tabs [data-sub="kennis"]').click();
check('Kennis toont disclaimer', (await page.locator('#body-sub .disclaimer').count()) === 1);
await page.locator('#body-tabs [data-sub="voeding"]').click();
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
await page.locator('.tab[data-tab="kompas"]').click();
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
await page.fill('#composer .input', 'gegeten: appel 80 kcal');
await page.press('#composer .input', 'Enter');
await page.waitForTimeout(900);
check('AI-commando logt eten', (await state()).meals[tKey].some((m) => m.name === 'appel' && m.kcal === 80));
await shot('05-ai');

// --- AI-toestemming bij een extern model (nep-server, er gaat niets het internet op) ---
{
  const bodies = [];
  await page.route('https://ai.example.test/**', (route) => {
    bodies.push(route.request().postData() || '');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'Testantwoord' } }] }) });
  });
  await page.click('#btn-settings');
  await page.selectOption('#st-ai', 'openai-compatible');
  await page.fill('#st-ep', 'https://ai.example.test/v1');
  await page.fill('#st-model', 'testmodel');
  await page.locator('#settings-form button.block').click();
  await page.waitForTimeout(300);
  check('Strook meldt: nog niets gekozen', (await page.locator('#share-strip.warn').count()) === 1);
  await page.fill('#composer .input', 'Hoe gaat het met me?');
  await page.press('#composer .input', 'Enter');
  await page.waitForSelector('#consent-form');
  check('Eerste vraag opent toestemming, niets verstuurd', bodies.length === 0 && (await page.locator('#consent-form input[type=checkbox]:checked').count()) === 0);
  await page.click('#consent-none');
  await waitUntil(() => document.querySelectorAll('.msg.bot').length > 0 && !document.querySelector('.msg.typing'));
  await page.waitForTimeout(600);
  const b0 = bodies[0] || '';
  check('Zonder toestemming alleen het bericht', bodies.length === 1 && b0.includes('Hoe gaat het met me?') && !b0.includes('stemming_1_5') && !b0.includes('Halve marathon') && b0.includes('deelt geen persoonlijke gegevens'));
  await page.click('#share-edit');
  await page.locator('#consent-form input[name="mood"]').check();
  await page.click('#consent-save');
  await page.waitForTimeout(300);
  check('Strook toont gekozen onderdeel', (await page.locator('#share-strip').textContent()).includes('Stemming, energie en concentratie'));
  await page.click('#share-view');
  const preview = await page.locator('#share-preview').textContent();
  check('Voorvertoning toont exact wat er gaat', preview.includes('stemming_1_5') && !preview.includes('Halve marathon') && !preview.includes('Authorization'));
  await page.locator('.sheet-backdrop').click();
  await page.waitForTimeout(400);
  await page.fill('#composer .input', 'En mijn energie?');
  await page.press('#composer .input', 'Enter');
  await waitUntil((n) => document.querySelectorAll('.msg.bot').length > n, await page.locator('.msg.bot').count());
  await page.waitForTimeout(600);
  const b1 = bodies[1] || '';
  check('Met toestemming alleen stemming erbij', bodies.length === 2 && b1.includes('stemming_1_5') && !b1.includes('Halve marathon') && !b1.includes('Hoe gaat het met me?'));
  const log = (await state()).privacy.aiLog;
  check('Logboek zonder inhoud', log.length === 2 && log[0].categories.join() === 'mood' && !JSON.stringify(log).includes('energie?'));
  await page.unroute('https://ai.example.test/**');
  await page.click('#btn-settings');
  await page.selectOption('#st-ai', 'local');
  await page.locator('#settings-form button.block').click();
  await page.waitForTimeout(300);
}

// --- Instellingen, export, demo ---
const FAKE_KEY = 'testsleutel-niet-echt-123';
await page.click('#btn-settings');
await page.fill('#st-name', 'Testpersoon');
await page.locator('#settings-form button.block').click();
check('Naam opslaan', (await state()).settings.name === 'Testpersoon');
await page.click('#btn-settings');
await page.selectOption('#st-start', 'home');
await page.locator('#settings-form button.block').click();
await page.waitForTimeout(200);
await page.goto(URL);
await page.waitForSelector('.page-title');
check('Startscherm instelbaar: Vandaag', await page.locator('.tab.active[data-tab="home"]').count() === 1);
await page.click('#btn-settings');
await page.selectOption('#st-start', 'kompas');
await page.locator('#settings-form button.block').click();
await page.waitForTimeout(200);
// Synthetische sleutel (geen echte) om te controleren dat hij niet lekt.
await page.evaluate((k) => { window.NEXUS.getState().settings.aiKey = k; }, FAKE_KEY);
const fs = await import('node:fs');
// Onversleutelde back-up: nooit met API-sleutel
await page.click('#btn-settings');
await page.click('#st-export');
await page.locator('#bk-mode [data-mode="plain"]').click();
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#bk-go')]);
let exportOk = false, plainText = '';
if (download) { plainText = fs.readFileSync(await download.path(), 'utf8'); exportOk = JSON.parse(plainText).data.goals.length === 1; }
check('Back-up exporteren', exportOk);
check('Onversleutelde back-up bevat geen API-sleutel', !!plainText && !plainText.includes(FAKE_KEY));
if (download) {
  const p = await download.path();
  await page.click('#btn-settings');
  await page.evaluate(() => { localStorage.clear(); });
  await page.setInputFiles('#st-import', p);
  await page.waitForTimeout(300);
  const st = await state();
  check('Back-up herstellen (sleutel op toestel blijft)', st.goals.length === 1 && st.settings.aiKey === FAKE_KEY);
}
// Versleutelde back-up
await page.click('#btn-settings');
await page.click('#st-export');
await page.fill('#bk-pw', 'kort');
await page.fill('#bk-pw2', 'kort');
await page.click('#bk-go');
check('Te kort wachtwoord geweigerd', (await page.locator('#bk-err').textContent()).includes('minstens'));
await page.fill('#bk-pw', 'correct-paard-batterij');
await page.fill('#bk-pw2', 'correct-paard-batterij');
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.click('#bk-go')]);
let encFile = null, encText = '';
if (dl2) { encFile = await dl2.path(); encText = fs.readFileSync(encFile, 'utf8'); }
const encObj = encText ? JSON.parse(encText) : {};
check('Versleutelde back-up is onleesbaar zonder wachtwoord', encObj.format === 'nexus-backup-versleuteld' && !encText.includes('Halve marathon') && !encText.includes(FAKE_KEY) && !encText.includes('Testpersoon'));
if (encFile) {
  await page.evaluate(() => { window.NEXUS.getState().goals.length = 0; });
  await page.click('#btn-settings');
  await page.setInputFiles('#st-import', encFile);
  await page.waitForSelector('#bk-open-pw');
  await page.fill('#bk-open-pw', 'fout-wachtwoord');
  await page.click('#bk-open-go');
  await waitUntil(() => document.querySelector('#bk-open-err')?.textContent.length > 0);
  { const msg = await page.locator('#bk-open-err').textContent(); const n = (await state()).goals.length; check('Verkeerd wachtwoord: nette fout, niets overschreven', msg.includes('onjuist') && n === 0, `${msg} · doelen ${n}`); }
  await page.fill('#bk-open-pw', 'correct-paard-batterij');
  await page.click('#bk-open-go');
  await waitUntil(() => window.NEXUS.getState().goals.length === 1);
  check('Versleutelde back-up herstellen', (await state()).goals.length === 1 && (await state()).settings.aiKey === FAKE_KEY);
}
// Herstelpunt + ongedaan maken bij demo-data
const goalsBefore = (await state()).goals.map((g) => g.title).join('|');
await page.click('#btn-settings');
await page.click('#st-demo');
await confirmDialog();
await page.waitForTimeout(300);
check('Demo-data laden', (await state()).workouts.length > 10);
check('Herstelpunt gemaakt vóór demo-data', await page.evaluate(() => JSON.parse(localStorage.getItem('nexus.v1.restore') || '[]').length >= 1));
await page.locator('.toast', { hasText: 'Demo-data geladen' }).locator('.toast-action').click();
await page.waitForTimeout(300);
check('Ongedaan maken zet oude gegevens terug', (await state()).goals.map((g) => g.title).join('|') === goalsBefore && (await state()).workouts.length < 10);
// Alles wissen → terugzetten via Instellingen → Herstelpunten
await page.click('#btn-settings');
await page.click('#st-reset');
await confirmDialog();
await page.waitForTimeout(300);
check('Alles wissen', (await state()).goals.length === 0);
await page.click('#btn-settings');
await page.locator('#st-points [data-restore]').first().click();
await confirmDialog();
await page.waitForTimeout(300);
check('Herstelpunt terugzetten na wissen', (await state()).goals.map((g) => g.title).join('|') === goalsBefore);
await page.click('#btn-settings');
await page.click('#st-demo');
await confirmDialog();
await page.waitForTimeout(300);
await page.goto(URL + '#home');
await page.waitForTimeout(1200);
await shot('06-home-demo');
await page.goto(URL + '#mind'); await page.waitForTimeout(1300); await shot('07-mind-demo');
await page.goto(URL + '#body'); await page.waitForTimeout(1300); await shot('08-body-demo');
await page.goto(URL + '#goals'); await page.waitForTimeout(1000);
await page.locator('.goal [data-act="expand"]').first().click(); await page.waitForTimeout(500); await shot('09-goals-demo');

// --- Beveiliging: gemanipuleerde back-up mag geen code uitvoeren ---
{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const evil = '"><img src=x onerror="window.__xss=1">';
  const day = tKey;
  const bad = { app: 'NEXUS', data: {
    settings: { name: evil, sleepTarget: evil, weeklyTrainingTarget: evil, kcalTarget: evil },
    priorities: { [day]: [{ id: evil, text: evil, done: false }] },
    moods: { [day]: { mood: evil, energy: evil } },
    reflections: { [day]: evil },
    habits: [{ id: evil, name: evil, icon: evil }], habitLog: { [day]: [evil] },
    sleep: { [day]: { hours: evil, quality: evil } },
    workouts: [{ id: evil, date: day, type: evil, minutes: evil, intensity: evil }],
    health: { [day]: { steps: evil, rhr: evil, hrv: evil } },
    meals: { [day]: [{ id: evil, name: evil, slot: evil, kcal: evil, protein: evil }] },
    water: { [day]: evil },
    goals: [{ id: evil, title: evil, why: evil, category: evil, deadline: evil, milestones: [{ id: evil, text: evil, done: false }] }],
    chat: [{ role: 'bot', text: `<b>vet</b> <img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`, t: 1 }, { role: evil, text: evil, t: 2 }],
  } };
  const file = path.join(os.tmpdir(), 'nexus-evil-backup.json');
  fs.writeFileSync(file, JSON.stringify(bad));
  await page.goto(URL + '#home');
  await page.waitForSelector('.page-title');
  await page.click('#btn-settings');
  await page.setInputFiles('#st-import', file);
  await page.waitForTimeout(400);
  for (const r of ['home', 'mind', 'body', 'goals', 'kompas']) {
    await page.goto(URL + '#' + r); await page.waitForTimeout(500);
    if (r === 'goals') { await page.locator('.goal [data-act="expand"]').first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
  const xss = await page.evaluate(() => ({ fired: window.__xss === 1, imgs: document.querySelectorAll('img[src="x"]').length }));
  check('Gemanipuleerde back-up voert geen code uit', !xss.fired && xss.imgs === 0, JSON.stringify(xss));
  check('Opmaak in AI-antwoord blijft (alleen veilige tags)', await page.locator('.msg.bot b', { hasText: 'vet' }).count() === 1);
  fs.unlinkSync(file);
}

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

// --- Content-Security-Policy ---
await page.goto(URL + 'uitleg-gezondheid.html');
await page.waitForTimeout(400);
check('Uitlegpagina laadt met CSP', (await page.locator('h1').count()) > 0 && (await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 1);
await page.goto(URL + '#home');
await page.waitForSelector('.page-title');
const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
check('CSP aanwezig en streng voor scripts', /script-src 'self'(;|$)/.test(csp) && csp.includes("object-src 'none'") && csp.includes("base-uri 'none'"), csp);

check('Geen JavaScript-fouten', errors.length === 0, errors.join(' | '));

// Bewuste overtreding als laatste: een ingevoegd inline script mag niet draaien.
const inline = await page.evaluate(() => { const sc = document.createElement('script'); sc.textContent = 'window.__inline = 1'; document.head.append(sc); return window.__inline === 1; });
check('CSP blokkeert ingevoegd inline script', inline === false);
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} geslaagd`);
process.exit(failed ? 1 : 0);
