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
//      * zonder tests, documentatie en prototypes.
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
const EXCLUDE_DIRS = new Set(); // sinds v1.4 hoort js/kompas bij de app

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
  // Eigen opslagsleutels: een test-artifact mag NOOIT de echte NEXUS-gegevens (nexus.v1) lezen of
  // omzetten, ook niet als claude.ai de browseropslag tussen artifacts zou delen.
  const swap = (rel, pairs) => {
    const f = join(OUT, rel);
    let t = readFileSync(f, 'utf8');
    for (const [from, to] of pairs) { if (!t.includes(from)) throw new Error(`${rel}: ${from} niet gevonden`); t = t.split(from).join(to); }
    writeFileSync(f, t);
  };
  swap('js/store.js', [["const KEY = 'nexus.v1';", "const KEY = 'nexus.test.v1';"], ["const RESTORE_KEY = 'nexus.v1.restore';", "const RESTORE_KEY = 'nexus.test.v1.restore';"]]);
  swap('js/views/body.js', [["const SUB_KEY = 'nexus.bodyTab';", "const SUB_KEY = 'nexus.test.bodyTab';"]]);
  copyFileSync(join(ROOT, 'tools/selftest/selftest.js'), join(OUT, 'js/selftest.js'));
  files.push('js/selftest.js');
  copyFileSync(join(ROOT, 'tools/selftest/boot-log.js'), join(OUT, 'js/boot-log.js'));
  files.push('js/boot-log.js');
  html = html.replace('<script src="js/boot-check.js"></script>', '<script src="js/boot-check.js"></script>\n  <script src="js/boot-log.js"></script>');
  html = html.replace('<script type="module" src="js/app.js"></script>', '<script type="module" src="js/app.js"></script>\n  <script type="module" src="js/selftest.js"></script>');
  html = html.replace('<title>NEXUS</title>', '<title>NEXUS v1.4 test (privé)</title>');
  if (!html.includes('js/selftest.js')) throw new Error('zelftest niet ingevoegd');
}
if (!/^<!doctype html>/i.test(html.trimStart())) throw new Error('index.html moet met <!DOCTYPE html> beginnen');
if (html === before) console.warn('Let op: index.html is niet aangepast');
writeFileSync(idxPath, html);

// Controle: niets uit prototype/ of tests/ in de verpakking
for (const f of files) if (/^(prototype|tests)\//.test(f)) throw new Error(`${f} hoort niet in de artifact-verpakking`);

const manifest = files.map((f) => ({ path: f.split('\\').join('/'), sha256: createHash('sha256').update(readFileSync(join(OUT, f))).digest('hex') }));
writeFileSync(join(OUT, '..', SELFTEST ? 'artifact-test-manifest.json' : 'artifact-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: manifest }, null, 2));
console.log(`${SELFTEST ? 'TEST-' : ''}Artifact-bestanden klaar in ${relative(ROOT, OUT)} (${files.length} bestanden). Niet gepubliceerd.`);
