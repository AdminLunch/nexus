// Bouwt de bestanden voor het Claude-artifact "NEXUS" uit de officiële broncode.
// Gebruik: node tools/build-artifact.mjs [uitvoermap]   (standaard: dist/artifact)
//
// Eén broncode, twee verpakkingen:
//  - PWA (GitHub Pages / iPhone-beginscherm): de repository zoals hij is.
//  - Claude-artifact: dezelfde code, met deze verschillen voor de artifact-omgeving:
//      * geen service worker / manifest (een artifact staat dat niet toe);
//      * geen eigen CSP-meta: claude.ai legt een eigen Content-Security-Policy op
//        (geen externe fetch, alleen eigen bestanden en vaste CDN's); onze strengere
//        meta zou de Claude-runtime (window.claude) kunnen blokkeren;
//      * zonder tests, documentatie, prototypes en het (nog niet gekoppelde) Open Kompas-prototype.
// Publiceren gebeurt NOOIT automatisch: alleen na akkoord, via de artifact-tools.
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SELFTEST = args.includes('--selftest'); // alleen voor een privé test-artifact
const OUT = join(ROOT, args.find((a) => !a.startsWith('--')) || (SELFTEST ? 'dist/artifact-test' : 'dist/artifact'));
const INCLUDE = ['css', 'js', 'index.html', 'uitleg-gezondheid.html'];
const EXCLUDE_DIRS = new Set(['js/kompas']); // Open Kompas: nog niet in de app gekoppeld (v1.4-prototype)

rmSync(OUT, { recursive: true, force: true });
const files = [];
function copy(rel) {
  const src = join(ROOT, rel);
  if (statSync(src).isDirectory()) {
    if (EXCLUDE_DIRS.has(rel)) return;
    for (const f of readdirSync(src)) copy(join(rel, f));
    return;
  }
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  copyFileSync(src, join(OUT, rel));
  files.push(rel);
}
INCLUDE.forEach(copy);

// index.html aanpassen voor de artifact-omgeving
const idxPath = join(OUT, 'index.html');
let html = readFileSync(idxPath, 'utf8');
const before = html;
html = html.replace(/\s*<!-- Content-Security-Policy[\s\S]*?-->\s*/, '\n  ');
html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/\s*<link rel="(icon|apple-touch-icon)"[^>]*>/g, '');
if (SELFTEST) {
  copyFileSync(join(ROOT, 'tools/selftest/selftest.js'), join(OUT, 'js/selftest.js'));
  files.push('js/selftest.js');
  html = html.replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="js/app.js"></script>\n  <script type="module" src="js/selftest.js"></script>');
  html = html.replace('<title>NEXUS</title>', '<title>NEXUS v1.4 test (privé)</title>');
  if (!html.includes('js/selftest.js')) throw new Error('zelftest niet ingevoegd');
}
if (!/^<!doctype html>/i.test(html.trimStart())) throw new Error('index.html moet met <!DOCTYPE html> beginnen');
if (html === before) console.warn('Let op: index.html is niet aangepast');
writeFileSync(idxPath, html);

// Controle: geen service-worker-bestand en geen verwijzing naar het Open Kompas-prototype
for (const f of files) {
  const t = readFileSync(join(OUT, f), 'utf8');
  if (f.endsWith('.js') && /from ['"].*kompas\//.test(t)) throw new Error(`${f} importeert het nog niet gekoppelde Open Kompas`);
}

const manifest = files.map((f) => ({ path: f.split('\\').join('/'), sha256: createHash('sha256').update(readFileSync(join(OUT, f))).digest('hex') }));
writeFileSync(join(OUT, '..', SELFTEST ? 'artifact-test-manifest.json' : 'artifact-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: manifest }, null, 2));
console.log(`${SELFTEST ? 'TEST-' : ''}Artifact-bestanden klaar in ${relative(ROOT, OUT)} (${files.length} bestanden). Niet gepubliceerd.`);
