# NEXUS — online zetten en op je iPhone installeren

Kosten: **€0**, eenmalig en daarna. Geen abonnementen, geen betaalde API's. Alle gegevens blijven op je iPhone.

## 1. Gratis online zetten met GitHub Pages (± 10 minuten)

Je hebt alleen een gratis GitHub-account nodig. Git of programmeerkennis is niet nodig.

1. Pak `nexus.zip` uit op je computer.
2. Ga naar **github.com** en maak een gratis account aan (of log in).
3. Klik rechtsboven op **+ → New repository**.
   - Naam: `nexus`
   - Zet hem op **Public** (GitHub Pages is gratis voor publieke repositories).
   - Klik **Create repository**.
4. Klik op de link **uploading an existing file**.
5. Sleep de **inhoud** van de map `nexus` in het venster — dus `index.html`, `manifest.webmanifest`, `sw.js` en de mappen `css`, `js` en `icons`. (`index.html` moet bovenaan in de repository staan, niet in een submap.) De map `tests` is optioneel.
6. Klik **Commit changes**.
7. Ga naar **Settings → Pages**.
   - Bij *Source*: kies **Deploy from a branch**.
   - Bij *Branch*: kies **main** en map **/ (root)**, klik **Save**.
8. Wacht 1–2 minuten en ververs de pagina. Bovenaan verschijnt je adres, bijvoorbeeld:
   `https://jouwnaam.github.io/nexus/`

> Publiek betekent dat de **code** zichtbaar is, niet je gegevens. Je stemming, doelen en reflecties staan alleen op je eigen telefoon en worden nergens naartoe gestuurd.

**Alternatief:** Cloudflare Pages (pages.cloudflare.com) is ook gratis: *Create → Pages → Upload assets*, sleep de map erin, klaar.

## 2. Op het beginscherm van je iPhone zetten

1. Open het adres in **Safari** (niet in Chrome of een andere browser — alleen Safari kan op iPhone een app op het beginscherm installeren).
2. Tik op de **deelknop** (vierkant met pijl omhoog) onderin.
3. Scroll en tik op **Zet op beginscherm**.
4. Laat de naam op **NEXUS** staan en tik **Voeg toe**.

Vanaf nu opent NEXUS schermvullend vanaf je beginscherm, zonder adresbalk, en werkt hij ook zonder internet.

## 3. Eerste keer gebruiken

- Tik op het **tandwiel** rechtsboven: vul je naam, slaapdoel en trainingsdoel in.
- Wil je eerst zien hoe de grafieken eruitzien? Tik in Instellingen op **Demo-data laden**. Met **Alles wissen** begin je daarna schoon.
- Pas je gewoontes aan onder **Mind → Beheren**.

## 4. Belangrijk over je gegevens

- De app op je beginscherm heeft **eigen opslag**, los van Safari. Gebruik daarom NEXUS steeds via het icoon op je beginscherm.
- Verwijder je het icoon, dan zijn je gegevens weg. Maak daarom af en toe een back-up: **Instellingen → Back-up maken** → *Bewaar in Bestanden*. Terugzetten doe je met **Herstellen**.

## 5. Updates doorvoeren

1. Pas bestanden aan en upload ze opnieuw in je GitHub-repository (*Add file → Upload files*, zelfde namen overschrijven).
2. Verhoog in `sw.js` de regel `const VERSION = 'nexus-v1.0.0';` (bijv. naar `v1.0.1`).
3. Open NEXUS op je iPhone en sluit hem één keer helemaal af en weer open; de nieuwe versie wordt dan geladen. Je gegevens blijven staan.

## 6. De AI-assistent

- Standaard draait **NEXUS Core**: een lokale assistent die je eigen gegevens analyseert. Gratis, offline, geen account. Typ `help` voor alle opdrachten, bijvoorbeeld `prioriteit: offerte afmaken` of `nieuw doel: 10 km lopen`.
- **Uitbreiden (optioneel, ook €0):** in Instellingen → AI kun je een eigen model koppelen via een OpenAI-compatibel adres, zoals Ollama of LM Studio op je eigen computer. Let op: je iPhone moet die computer dan kunnen bereiken, en Safari blokkeert een `http://`-adres vanaf een `https://`-site — daarvoor heb je een https-tunnel of -proxy nodig. Voor dagelijks gebruik is NEXUS Core genoeg.
- Zelf een nieuwe AI-provider toevoegen kan in `js/ai/engine.js` met `registerProvider({ id, name, reply })`.

## Projectstructuur

```
nexus/
├── index.html            app-shell, navigatie
├── manifest.webmanifest  installatie-info (naam, iconen, kleuren)
├── sw.js                 service worker (offline)
├── css/app.css           design: neon, glassmorphism, animaties
├── icons/                app-iconen
├── js/
│   ├── app.js            routing, instellingen, back-up
│   ├── store.js          lokale opslag + berekeningen (scores, reeksen)
│   ├── ui.js             grafieken (SVG), ring, sheets, meldingen
│   ├── ai/engine.js      AI-module met uitbreidbare providers
│   └── views/            home, mind, body, goals, ai
└── tests/smoke.mjs       geautomatiseerde test (36 controles)
```
