// Rooktest voor de artifact-verpakking (dist/artifact) met een NAGEBOOTSTE Claude-runtime.
// Er wordt niets naar Claude of naar een server verstuurd: window.claude is hier een testdubbel.
// Gebruik: node tools/build-artifact.mjs && python3 -m http.server 8080 &
//          node tests/artifact.smoke.mjs http://localhost:8080/dist/artifact/
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8080/dist/artifact/';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' });
await ctx.addInitScript(() => {
  const log = { sample: [], dbSet: [], downloads: [] };
  let doc = null;
  window.__claudeLog = log;
  const api = {
    sample: async (messages, opts) => { log.sample.push(JSON.stringify(messages)); return { text: '**Testantwoord** van de nep-Claude' }; },
    db: { collection: () => ({ doc: () => ({ get: async () => (doc ? { exists: true, data: () => doc } : { exists: false }), set: async (d) => { doc = d; log.dbSet.push(d.json.length); log.lastDoc = d.json; }, delete: async () => { doc = null; } }) }) },
    user: { id: async () => 'testgebruiker' },
    downloads: { save: async ({ filename, data }) => { log.downloads.push({ filename, size: data.length }); } },
  };
  window.claude = { use: async (name) => api[name] };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const log = () => page.evaluate(() => window.__claudeLog);
const confirmDialog = async () => { await page.locator('.dialog [data-r="1"]').click(); await page.waitForTimeout(200); };

await page.goto(URL);
await page.waitForSelector('.page-title');
check('Laadt als artifact (geen CSP-meta, geen manifest)', (await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 0 && (await page.locator('link[rel="manifest"]').count()) === 0);
check('Geen service worker in artifact', !(await page.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration?.()))));
check('Sync-indicator zichtbaar en uit', await page.locator('#sync:not([hidden])[data-s="off"]').count() === 1);
check('Niets naar Claude-opslag zonder keuze', (await log()).dbSet.length === 0);

// Routing met gewone #namen (artifact-eis)
for (const t of ['mind', 'body', 'goals', 'ai', 'home']) { await page.locator(`.tab[data-tab="${t}"]`).click(); await page.waitForTimeout(250); }
check('Navigatie via #naam', page.url().endsWith('#home'));

// Demo-data (fictief) via eigen dialoog
await page.click('#btn-settings');
await page.click('#st-demo');
await confirmDialog();
await page.waitForTimeout(300);
check('Demo-data via eigen dialoog (geen confirm())', (await page.evaluate(() => document.querySelectorAll('.meal-item, .home-slot').length)) > 0);

// Claude als AI: eerst toestemming, daarna alleen het toegestane
await page.click('#btn-settings');
await page.selectOption('#st-ai', 'claude');
await page.locator('#settings-form button.block').click();
await page.waitForTimeout(300);
await page.locator('.tab[data-tab="ai"]').click();
await page.waitForSelector('#composer');
await page.fill('#composer .input', 'Hoe gaat het?');
await page.press('#composer .input', 'Enter');
await page.waitForSelector('#consent-form');
check('Claude: eerst toestemming, niets verstuurd', (await log()).sample.length === 0);
await page.click('#consent-none');
await page.waitForTimeout(1200);
let l = await log();
check('Claude: alleen het bericht, geen gegevens', l.sample.length === 1 && l.sample[0].includes('Hoe gaat het?') && l.sample[0].includes('deelt geen persoonlijke gegevens') && !l.sample[0].includes('stemming_1_5'));
check('Claude: geen hardgecodeerde diagnose', !/heeft ADHD/i.test(l.sample[0]));
check('Claude-antwoord veilig opgemaakt', await page.locator('.msg.bot b', { hasText: 'Testantwoord' }).count() === 1);
check('Logboek noteert claude.ai zonder inhoud', await page.evaluate(() => { const lg = JSON.parse(localStorage.getItem('nexus.v1')).privacy.aiLog; return lg[0]?.host === 'claude.ai' && !JSON.stringify(lg).includes('Hoe gaat het'); }));

// Back-up via Claude-downloads
await page.click('#btn-settings');
await page.click('#st-export');
await page.fill('#bk-pw', 'correct-paard-batterij');
await page.fill('#bk-pw2', 'correct-paard-batterij');
await page.click('#bk-go');
await page.waitForTimeout(2500);
l = await log();
check('Versleutelde back-up via Claude-downloads', l.downloads.length === 1 && /versleuteld\.json$/.test(l.downloads[0].filename));

// Synchroniseren: alleen na bewuste keuze
await page.click('#btn-settings');
await page.locator('#st-cloud').check();
await confirmDialog();
await page.waitForTimeout(1800);
l = await log();
check('Synchroniseren pas na expliciete keuze', l.dbSet.length >= 1 && (await page.locator('#sync[data-s="ok"]').count()) === 1);
await page.keyboard.press('Escape');
await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } }).catch(() => {});
await page.waitForTimeout(300);
await page.click('#btn-settings');
await page.selectOption('#st-ai', 'openai-compatible');
await page.fill('#st-key', 'testsleutel-niet-echt');
await page.locator('#settings-form button.block').click();
await page.waitForTimeout(1800);
l = await log();
check('API-sleutel nooit in de cloud', !!l.lastDoc && !l.lastDoc.includes('testsleutel-niet-echt') && l.lastDoc.includes('"cloudSync":true'));
await page.keyboard.press('Escape');

// XSS zonder eigen CSP (zoals in claude.ai, waar inline scripts zijn toegestaan): alleen escaping beschermt.
{
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const evil = '"><img src=x onerror="window.__xss=1">';
  const day = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const bad = { app: 'NEXUS', data: {
    settings: { name: evil, waterTarget: evil }, priorities: { [day]: [{ id: evil, text: evil }] },
    moods: { [day]: { mood: evil, energy: evil, focus: evil } }, reflections: { [day]: evil },
    habits: [{ id: evil, name: evil, icon: evil }], habitLog: { [day]: [evil] },
    sleep: { [day]: { hours: evil, quality: evil } }, workouts: [{ id: evil, date: day, type: evil, minutes: evil }],
    meals: { [day]: [{ id: evil, name: evil, slot: evil, time: evil, tags: [evil, 'eiwit'], kcal: evil }, { id: 'sk', slot: 'lunch', skipped: true, time: evil }] },
    mealPlan: { [day]: { ontbijt: evil, [evil]: evil } }, water: { [day]: evil },
    thoughts: [{ id: evil, date: day, t: 1, kind: evil, text: evil }],
    goals: [{ id: evil, title: evil, why: evil, category: evil, deadline: evil, milestones: [{ id: evil, text: evil }] }],
    chat: [{ role: 'bot', text: `<b>vet</b> ${evil}<script>window.__xss=1</script>`, t: 1 }],
  } };
  const file = path.join(os.tmpdir(), 'nexus-artifact-evil.json');
  fs.writeFileSync(file, JSON.stringify(bad));
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#btn-settings');
  await page.setInputFiles('#st-import', file);
  await page.waitForTimeout(500);
  for (const r of ['home', 'mind', 'body', 'goals', 'ai']) {
    await page.goto(URL + '#' + r); await page.waitForTimeout(400);
    if (r === 'body') for (const sub of ['voeding', 'inzichten', 'kennis', 'herstel']) { await page.locator(`[data-sub="${sub}"]`).click(); await page.waitForTimeout(250); }
    if (r === 'goals') { await page.locator('.goal [data-act="expand"]').first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
  await page.goto(URL + '#body'); await page.locator('[data-sub="voeding"]').click(); await page.waitForTimeout(200);
  await page.locator('.meal-item').first().click().catch(() => {}); await page.waitForTimeout(300);
  const xss = await page.evaluate(() => ({ fired: window.__xss === 1, imgs: document.querySelectorAll('img[src="x"]').length }));
  check('XSS zonder CSP: gemanipuleerde back-up voert geen code uit (alle schermen, ook nieuwe velden)', !xss.fired && xss.imgs === 0, JSON.stringify(xss));
  check('Inline script is in deze omgeving wél toegestaan (bevestigt dat escaping de enige verdediging is)', await page.evaluate(() => { const sc = document.createElement('script'); sc.textContent = 'window.__inl=1'; document.head.append(sc); return window.__inl === 1; }));
  fs.unlinkSync(file);
}
check('Geen JavaScript-fouten', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} geslaagd`);
process.exit(results.every(Boolean) ? 0 : 1);
