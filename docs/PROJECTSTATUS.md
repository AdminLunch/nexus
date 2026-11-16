# NEXUS — Projectstatus

> **Centrale bron** voor versie, architectuur, functies, besluiten, beveiliging en planning.
> Lees dit aan het begin van élke NEXUS-sessie (Claude Code én Claude-project).
> Claude heeft geen toegang tot oude gesprekken: wat hier niet staat, is voor een nieuwe sessie onbekend.
> Werk dit bestand bij na elk afgerond onderdeel of besluit.

Laatst bijgewerkt: 2026-11-16 · Bijgewerkt door: Claude Code (sessie "één NEXUS").

## 1. Huidige versie — waar staat wat?

**Uitgangspunt voor alle nieuwe ontwikkeling: branch `claude/nexus-v1.4-unified` (v1.4.0-dev).**
Deze bevat alles wat eerder is gebouwd en getest: v1.3.0 + P0-beveiliging (v1.3.1) + Open Kompas-basis + alle
functies uit het Claude-artifact. Nog niet samengevoegd met `main` (wacht op akkoord).

| Lijn | Versie | Branch / plek | Status |
|---|---|---|---|
| **Verenigde ontwikkelversie** | **1.4.0-dev** | **`claude/nexus-v1.4-unified`** | **Nieuwste, getest. Wacht op akkoord voor `main` en artifact** |
| Productie | 1.2.0 | `main` (`fa3eb20`) | Ongewijzigd |
| Voeding kcal/macro's | 1.3.0 | `claude/cool-cerf-fm1qx2` (`ab1458b`) | Opgenomen in unified |
| P0-beveiliging | 1.3.1 | `claude/nexus-p0-security` (`47e18e0`) | Opgenomen in unified |
| Open Kompas-basismodule | 1.4 (prototype) | `claude/nexus-v1.4-open-kompas` (`74d2fe2`) | Opgenomen in unified, nog niet in de app gekoppeld |
| Claude-artifact "NEXUS" | 1.2 (artifact-lijn, schema 2) | https://claude.ai/artifact/EwVcSEdYSyYjQExnHeDuVs · bron gearchiveerd op `claude/artifact-snapshot-v1.2` | Live, ongewijzigd. Geen P0. Wacht op vervanging door de verenigde versie (akkoord nodig) |

v1.4 "Persoonlijk Kompas" is **in de app ingebouwd** (commit `17da745`, 16-11-2026):
- een middenknop 🧭 in de tabbalk;
- één gesprek: NEXUS Core plus Open Kompas, lokaal of via Claude na P0-toestemming;
- Mijn Kompas met opslag in `state.kompas`;
- een nieuwe toestemmingscategorie "Mijn Kompas", standaard uit.

Zichtbaar in het privé test-artifact. Proactieve patroonherkenning volgt nog.

## 2. Architectuur

Statische PWA in vanilla ES-modules, geen build-stap, gegevens lokaal (`localStorage`, sleutel `nexus.v1`).

```
index.html, css/app.css
js/app.js            routing (#home #mind #body #goals #ai), instellingen, back-up, herstelpunten
js/store.js          staat, migraties (schema 3), afgeleide gegevens, demo-data
js/schema.js         typecontrole van alle opgeslagen/geïmporteerde gegevens (P0-2)
js/crypto.js         versleutelde back-ups (P0-1)
js/privacy/consent.js AI-toestemming per categorie en bestemming (P0-3)
js/cloud.js          optionele synchronisatie via het Claude-account (standaard uit)
js/health.js         Apple Gezondheid-import (P0-4)
js/ai/engine.js      NEXUS Core (lokaal) · Claude (artifact) · eigen OpenAI-compatibel model
js/nutrition/        eetmomenten, bouwstenen, inzichten, kennisbank
js/views/            home, mind, body (Herstel/Voeding/Inzichten/Kennis), goals, ai
js/kompas/           Open Kompas-basis (zelfstandig, nog niet gekoppeld)
prototype/open-kompas/ los prototypescherm (alleen synthetisch, niets opgeslagen)
tools/build-artifact.mjs  maakt de artifact-verpakking (dist/artifact) uit dezelfde broncode
```

**Eén broncode, twee verpakkingen.** De PWA is de repository zelf. Het artifact wordt met
`npm run build:artifact` uit dezelfde code gemaakt (zonder service worker, manifest en eigen CSP-meta).
Het artifact wordt nooit los bewerkt.

### Datamodel (schema 3)
- Maaltijd: `{id, slot: ontbijt|lunch|diner|snack, name, time, tags[], kcal?, protein?, carbs?, fat?}` of `{id, slot, skipped: true, time}`.
- `moods[datum] = {mood?, energy?, focus?}`: elk veld optioneel, niets wordt verzonnen.
- Nieuw t.o.v. v1.3.1: `mealPlan`, `thoughts`, `updatedAt`, `settings.trackKcal` (standaard uit), `settings.cloudSync` (standaard uit).
- Migratie artifact-schema 2 → 3: `text` → `name`, `avond` → `diner`. kcal-weergave blijft aan voor wie al kcal invulde.
  Getest met echte artifact-code (`tests/upgrade-from-artifact.mjs`).

## 3. Functies (verenigd)
- **Home**: dagscore, prioriteiten, check-in, gewoontes, eetmomenten vandaag en water.
- **Mind**: stemming, energie, concentratie, reflectie, gedachten-notities, gewoontes en trends.
- **Body**:
  - *Herstel*: slaap, training, herstelscore, Apple Gezondheid-import.
  - *Voeding*: eetmomenten (gegeten/overgeslagen), bouwstenen, water, planning, en optioneel kcal en macro's.
  - *Inzichten*: samenhang tussen voeding en stemming, energie, concentratie en slaap; samenhang, geen oorzaak.
  - *Kennis*: wat over voeding bekend is, met bewijsniveau. Geen behandeling.
- **Goals**: doelen met mijlpalen.
- **AI**:
  - NEXUS Core: lokaal, met commando's zoals `ontbijt: …`, `gegeten: … 350 kcal`, `water` en weekrapport.
  - Claude: alleen in het artifact, alleen na toestemming.
  - Een eigen model, alleen na toestemming.
- **Gegevens**: versleutelde back-ups (in het artifact via Claude-downloads), herstelpunten, demo-data (fictief) en alles wissen.

## 4. Beveiliging en privacy (P0, alle zeven aanwezig in unified)

| # | Maatregel | Status |
|---|---|---|
| P0-1 | Versleutelde back-ups; API-sleutel nooit onversleuteld | ✅ |
| P0-2 | Typecontrole en XSS-bescherming (back-upimport, chat) | ✅ (uitgebreid voor schema 3) |
| P0-2b | Herstelpunten vóór destructieve acties | ✅ |
| P0-3 | AI-toestemming per categorie en bestemming, voorvertoning, logboek | ✅ (nu ook voor Claude) |
| P0-4 | Beveiligde Apple Gezondheid-import | ✅ |
| P0-5 | Content-Security-Policy, afgeschermde debugtoegang | ✅ PWA · ⚠️ artifact gebruikt de CSP van claude.ai (zie open punten) |
| P0-6 | Repo-hygiëne, werkafspraken gevoelige gegevens (`SECURITY.md`) | ✅ |
| P0-7 | Testbasis | ✅ |

Afspraken:
- Alleen fictieve gegevens in ontwikkeling en tests.
- Synchroniseren via het Claude-account staat standaard uit.
- Gevoelige categorieën (verslaving, middelen, triggers, herstel) pas bouwen na eigen toestemming, versleuteling en wisbeleid.

## 4b. Extra risico's van de artifact-runtime t.o.v. de zelfstandige app

| Risico | Status / maatregel |
|---|---|
| **Inline scripts toegestaan** door de CSP van claude.ai, zodat de strenge P0-5-CSP in het artifact niet geldt | Escaping (`esc`), `safeHtml` en typecontrole zijn de verdediging. Getest zonder CSP met een gemanipuleerde back-up op alle schermen en nieuwe velden (lokaal, gesimuleerd). In Claude meet de zelftest dit (nog niet uitgevoerd) |
| **Gedeelde browseropslag tussen artifacts?** | **Gemeten in Claude: nee.** Elk artifact heeft een eigen origin (`<slug>.frame.claudeusercontent.com`). Gevolg: de lokale gegevens van het bestaande artifact zijn alleen bereikbaar vanuit datzelfde artifact. Migratie kan dus alleen door **dezelfde artifact-slug opnieuw te publiceren** (vervangen), niet via een nieuw artifact. Een nieuw artifact kan de oude gegevens alleen overnemen via een back-up |
| **`localStorage` niet gegarandeerd blijvend** in een artifact | Back-ups (via Claude-downloads), herstelpunten en optionele synchronisatie (standaard uit). De zelftest meet het blijven bestaan na opnieuw openen |
| **Claude-AI met tools** (prioriteit, doel, maaltijd, water toevoegen) | Alleen na P0-toestemming én de eigen toestemmingsvraag van claude.ai. Tools kunnen alleen toevoegen of afvinken, niet wissen. Resterend risico: prompt-injectie via gedeelde eigen teksten kan een ongewenste toevoeging veroorzaken (laag; te herstellen) |
| **Cloudkopie** bij synchronisatie (`data/users/<id>/nexus`, privé, ook voor de eigenaar) | Standaard uit, alleen bewust aan, zonder API-sleutel, en te wissen. Met echte gegevens pas na een bewuste keuze |
| **Downloads** van back-ups via Claude | Standaard versleuteld; de gebruiker bevestigt elke download |
| **Debugtoegang** (`window.NEXUS.getState`) | Alleen op localhost of met `?debug`; in een artifact niet bereikbaar |

## 5. Tests (stand 2026-11-16, branch unified) — alle LOKAAL / GESIMULEERD

| Test | Resultaat |
|---|---|
| `npm run test:unit`: o.a. migratie, oude artifact-back-ups, oude herstelpunten, toestemming, XSS-typecontrole, Claude zonder toestemming | 31/31 |
| `npm run test:kompas`: Open Kompas | 45/45 |
| `npm run test:smoke`: hele PWA in iPhone-emulatie (met CSP) | 77/77 |
| `tests/kompas/prototype.smoke.mjs` | 21/21 |
| `tests/artifact.smoke.mjs`: artifact-verpakking, nagebootste Claude-runtime, XSS zonder CSP | 17/17 |
| `tests/upgrade-from-artifact.mjs`: echte oude artifact-code → v1.4 in dezelfde opslag + oude back-up terugzetten | 18/18 |
| Zelftest lokaal met nagebootste runtime | Werkt. Eigen en "echte" gegevens blijven onaangeroerd. Signaleert terecht gedeelde opslag, inline scripts en een eerste bezoek |
| **Zelftest in de echte Claude-omgeving** | Desktop + iPhone: 0 fouten; zie §6b |

## 6. Goedgekeurde besluiten
1. **Open Kompas is een fundamenteel en hard ontwerpprincipe** voor alle onderdelen. Zie `docs/open-kompas/ONTWERP.md` en `CLAUDE.md`.
2. **Eén NEXUS**: één broncode in GitHub; het artifact wordt daaruit gebouwd en niet los ontwikkeld. Geen losse apps of dubbele profielen.
3. **NEXUS is voor iedereen**: geen vooraf bepaalde diagnose, probleemcategorie of ontwikkelrichting. Gespecialiseerde ondersteuning (zoals herstel bij verslaving) is optioneel, alleen op initiatief van de gebruiker en nooit het standaard uitgangspunt.
4. Alleen fictieve testgegevens zolang privacy en beveiliging niet aantoonbaar geschikt zijn.
5. Geen merge naar `main`, geen publicatie, geen vervanging van het artifact, geen productiewijziging en geen risicovolle migratie zonder expliciet akkoord.
6. Onderzoek, documentatie en niet-destructief werk op een aparte branch mogen zonder vooraf akkoord.
7. P0 vóór v1.4-integratie (gedaan: P0 zit in unified).
8. **Proactieve patroonherkenning** (16-11-2026). Met toestemming signaleert NEXUS zelf mogelijke patronen, zowel positief als negatief en in alle levensgebieden. Dat gebeurt voorzichtig, controleerbaar (onderbouwing en aantal dagen) en altijd als mogelijkheid, nooit als etiket.
   - De gebruiker kan elke suggestie bevestigen, corrigeren, afwijzen of de functie uitzetten.
   - Eerdere inzichten: Eerdere inzichten mogen als voorlopige context worden gebruikt om verbanden te ontdekken en persoonlijkere suggesties te doen. Ze mogen echter nooit leiden tot vaste conclusies, diagnoses of beperking van nieuwe mogelijkheden. NEXUS blijft eerdere inzichten actief heroverwegen.
   - Gespecialiseerde modules mag NEXUS voorzichtig voorstellen, maar nooit zelf activeren.
   - Ontwerp: `docs/open-kompas/ONTWERP.md` §7.

## 6b. Test in de echte Claude-omgeving (uitgevoerd 16-11-2026, 17:20–17:23 UTC)
Uitgevoerd door de eigenaar in het privé test-artifact, gebouwd uit `3507804` + zelftest. Resultaten in de database `selftest` (5 runs).

| Run | Omgeving | Resultaat |
|---|---|---|
| `run-mwjj4mst` (auto) | Desktop, Chromium | 24 ok · 2 aandachtspunten (eerste bezoek; inline scripts toegestaan) · 0 fout |
| `run-mwjj4u9s` (AI) | Desktop | Claude antwoordt na "niets delen" (3,3 s); logboek: claude.ai, geen categorieën, geen inhoud |
| `run-mwjj4xbz` (download) | Desktop | Download via Claude geslaagd |
| `run-mwjj7jg2` (auto, opnieuw geopend) | Desktop | 25 ok · 1 aandachtspunt (inline scripts) · 0 fout. **Opslag bleef bewaard** |
| `run-mwjj850z` (auto) | **iPhone (iOS), 430×819** | 24 ok · 2 aandachtspunten (eerste bezoek; inline scripts) · 0 fout |

**Echt in Claude aangetoond:**
- runtime-capabilities;
- opslag per artifact gescheiden;
- opslag blijft bewaard na opnieuw openen (desktop);
- externe verbindingen geblokkeerd;
- migratie;
- sync uit, geen cloudkopie;
- P0-toestemming: niets voor toestemming, alleen het bericht zonder categorieën, gevoelige velden nooit, intrekken werkt;
- Claude-AI en logboek;
- download;
- alle schermen op desktop én iPhone, zonder horizontale scroll;
- XSS-bescherming;
- geen JS-fouten.

**Niet gemeten:**
- het blijven bestaan van opslag op iPhone;
- de AI- en downloadtest op iPhone.

Dit is platformgedrag dat voor de oude en de nieuwe versie gelijk is.

## 6c. Open Kompas-prototype als privé artifact
- **"NEXUS Open Kompas — prototype (privé)"**: https://claude.ai/artifact/JpkGEtRDQ3D8QXpwkLnJYB (slug `9055f9dc-…`, `read: owner`, capability: `sample`).
- Gebouwd uit `9e802c5` met `node tools/build-kompas-preview.mjs`. Geen opslag (alles in het geheugen, herladen wist alles), alleen fictieve gegevens.
- Speels ontwerp: een kompas met bolletjes per richting, chatbubbels, keuzekaarten en ronde stuurknoppen.
- **Gesprek via Claude**, alleen na een toestemmingskaart in de pagina. Claude formuleert; de lokale waarborgen hebben het laatste woord:
  - taalcontrole met één nieuwe poging, daarna terugval op de lokale motor;
  - interpretatiebudget;
  - afgewezen verbanden worden niet herhaald;
  - bewaren alleen na een tik;
  - vaste veiligheidsreactie (113), zonder Claude.
- Getest met een nagebootste Claude (`tests/kompas/prototype-ai.smoke.mjs`, 14/14) en zonder Claude (`prototype.smoke.mjs`, 25/25). **Nog niet in de echte Claude-omgeving getest.**
- Alleen ter kennismaking. Het Kompas is nog niet in NEXUS zelf gekoppeld.
- **Kompas is het startscherm** (besluit eigenaar, optie A, 16-11-2026):
  - NEXUS opent op het Kompas, met bovenaan een Vandaag-strook: dagscore, eerstvolgende prioriteit, stemming, water en eten.
  - Home heet nu **Vandaag** en blijft het volledige dagoverzicht.
  - Het startscherm is in te stellen bij Instellingen › Startscherm (Kompas of Vandaag).
- **Plek in NEXUS** (idee van de eigenaar, 16-11-2026; **gebouwd** in `17da745`):
  - Een ronde **kompasknop in het midden van de tabbalk**: `Home · Mind · (🧭 Kompas) · Body · Goals`.
  - Het losse AI-tabblad gaat op in het Kompas-gesprek. Commando's en de chatgeschiedenis blijven behouden.
  - In het Kompas: *💬 Gesprek / 🧭 Mijn Kompas*.
  - Optioneel kleine verwijzingen vanuit Home (tegel) en Mind ("Bespreek in Kompas"). Bij integratie gaat het Claude-gesprek via de P0-toestemming (eigen categorie).

## 7. Open punten (wachten op besluit of werk)
1. **Akkoord nodig** (technisch klaar volgens §6b):
   - `claude/nexus-v1.4-unified` naar `main`.
   - Het bestaande artifact bijwerken met `dist/artifact`. Bestaande lokale gegevens in het artifact migreren automatisch; maak vooraf een back-up.
2. **CSP in het artifact**: of de strenge CSP-meta samen kan gaan met de Claude-runtime, is alleen live te testen. Voorstel: één keer testen in een privé test-artifact (akkoord nodig).
3. **Claude-runtime** (sample, db, downloads) is alleen met een testdubbel getest, niet live.
4. **Proactieve patroonherkenning bouwen** (na de Open Kompas-integratie):
   - een eigen toestemmingscategorie `patterns`, standaard uit;
   - standaard lokaal berekend, met signaalregels in `js/kompas/guards.js`;
   - suggesties als "mogelijk verband" in het Kompas-geheugen;
   - te bevestigen, af te wijzen of uit te zetten.

   De bestaande voedingsinzichten zijn een eerste, passieve vorm.
5. **Open Kompas koppelen** aan de app: eigen tab of gesprek, opslag via de `store`-adapter, AI-context via `consent.js` met een eigen categorie (standaard uit). Taalcontrole (`lintOutgoing`) ook op antwoorden van externe AI.
6. In het artifact is `localStorage` niet gegarandeerd blijvend. Voor echte gegevens: back-ups of bewust gekozen synchronisatie.
7. Klein punt:
   - Back-up-fallback in het artifact als downloads geweigerd worden: tekst kopiëren.

## 8. Planning / roadmap
1. **Nu**: één NEXUS afronden. Unified reviewen, akkoord voor `main` en artifact, live artifact-test.
2. **v1.4 Persoonlijk Kompas**: Open Kompas in de app integreren (kennismaking, gesprekken, corrigeerbaar geheugen, waarborgen), daarna **proactieve patroonherkenning** met eigen toestemming.
3. **Optionele modules** (ontwerp: `docs/ontwerp/FOCUS-EN-HERSTEL.md`; nog niet bouwen):
   - **Focus & Gewoontes** (voor iedereen), met het onderzoek *NEXUS Focus & Triggers*:
     - vrijwillig apps en websites blokkeren;
     - schema's en limieten;
     - een reflectie of alternatief bij een blokkade;
     - Apple Screen Time API via een native iOS-component;
     - privacyvriendelijk;
     - blokkades altijd zelf te wijzigen of op te heffen.
   - **Herstel & Triggers** (alleen op eigen initiatief):
     - triggers, een plan voor sterke drang en terugvalpreventie;
     - voortgang zonder schaamte;
     - steun van een vertrouwd persoon, alleen op initiatief van de gebruiker.

     Aanvulling op professionele zorg, geen vervanging.
   - Voorwaarde: eerst eigen toestemmingscategorieën, versleuteling op het toestel, wisbeleid en controle van de bestaande architectuur.

## 9. Werkwijze voor elke nieuwe sessie
1. Lees `CLAUDE.md`, dit bestand en `SECURITY.md`.
2. Controleer met `git fetch` of er nieuwere branches zijn dan hierboven. Ga niet alleen af op versienummers.
3. Benoem welke branch het uitgangspunt is en welke informatie ontbreekt.
4. Bouw voort op goedgekeurde besluiten; vraag akkoord voor grote wijzigingen.
5. Werk dit bestand bij aan het eind.
