// Bouwt het Open Kompas-prototype als losse artifact-pagina (alleen ter kennismaking).
// Gebruik: node tools/build-kompas-preview.mjs [uitvoermap]  (standaard: dist/kompas-preview)
// Zelfde code als prototype/open-kompas + js/kompas; alleen de importpaden worden aangepast
// omdat index.html in een artifact in de root moet staan. Geen opslag, geen netwerk, geen capabilities.
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, process.argv[2] || 'dist/kompas-preview');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'js/kompas'), { recursive: true });
for (const f of ['index.html', 'style.css']) writeFileSync(join(OUT, f), readFileSync(join(ROOT, 'prototype/open-kompas', f)));
const app = readFileSync(join(ROOT, 'prototype/open-kompas/app.js'), 'utf8').split("'../../js/kompas/").join("'./js/kompas/");
if (app.includes('../../')) throw new Error('onverwacht pad in app.js');
writeFileSync(join(OUT, 'app.js'), app);
for (const f of readdirSync(join(ROOT, 'js/kompas'))) writeFileSync(join(OUT, 'js/kompas', f), readFileSync(join(ROOT, 'js/kompas', f)));
let html = readFileSync(join(OUT, 'index.html'), 'utf8');
if (!/^<!doctype html>/i.test(html.trimStart())) throw new Error('index.html moet met <!DOCTYPE html> beginnen');
console.log('Open Kompas-preview klaar in', OUT);
