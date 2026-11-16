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

v1.4 "Persoonlijk Kompas" is **gedeeltelijk gebouwd**: alleen de zelfstandige basismodule (geheugen, gespreksmotor,
waarborgen, prototypescherm). Integratie in de app, opslag en AI-koppeling volgen nog.

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

## 5. Tests (stand 2026-11-16, branch unified)

| Test | Resultaat |
|---|---|
| `npm test`: unit (28) + Open Kompas (45) | 28/28 · 45/45 |
| `npm run test:smoke`: hele app in iPhone-emulatie | 77/77 |
| `tests/artifact.smoke.mjs`: artifact-verpakking met nagebootste Claude-runtime | 15/15 |
| `tests/upgrade-from-artifact.mjs`: echte artifact-code → unified, gegevensbehoud | 15/15 |
| `tests/kompas/prototype.smoke.mjs` | 21/21 |

## 6. Goedgekeurde besluiten
1. **Open Kompas is een fundamenteel en hard ontwerpprincipe** voor alle onderdelen. Zie `docs/open-kompas/ONTWERP.md` en `CLAUDE.md`.
2. **Eén NEXUS**: één broncode in GitHub; het artifact wordt daaruit gebouwd en niet los ontwikkeld. Geen losse apps of dubbele profielen.
3. **NEXUS is voor iedereen**: geen vooraf bepaalde diagnose, probleemcategorie of ontwikkelrichting. Gespecialiseerde ondersteuning (zoals herstel bij verslaving) is optioneel, alleen op initiatief van de gebruiker en nooit het standaard uitgangspunt.
4. Alleen fictieve testgegevens zolang privacy en beveiliging niet aantoonbaar geschikt zijn.
5. Geen merge naar `main`, geen publicatie, geen vervanging van het artifact, geen productiewijziging en geen risicovolle migratie zonder expliciet akkoord.
6. Onderzoek, documentatie en niet-destructief werk op een aparte branch mogen zonder vooraf akkoord.
7. P0 vóór v1.4-integratie (gedaan: P0 zit in unified).

## 7. Open punten (wachten op besluit of werk)
1. **Akkoord nodig**:
   - `claude/nexus-v1.4-unified` naar `main`.
   - Het bestaande artifact bijwerken met `dist/artifact`. Bestaande lokale gegevens in het artifact migreren automatisch; maak vooraf een back-up.
2. **CSP in het artifact**: of de strenge CSP-meta samen kan gaan met de Claude-runtime, is alleen live te testen. Voorstel: één keer testen in een privé test-artifact (akkoord nodig).
3. **Claude-runtime** (sample, db, downloads) is alleen met een testdubbel getest, niet live.
4. **Open Kompas koppelen** aan de app: eigen tab of gesprek, opslag via de `store`-adapter, AI-context via `consent.js` met een eigen categorie (standaard uit). Taalcontrole (`lintOutgoing`) ook op antwoorden van externe AI.
5. In het artifact is `localStorage` niet gegarandeerd blijvend. Voor echte gegevens: back-ups of bewust gekozen synchronisatie.
6. Kleine punten:
   - De rooktest gebruikt nog een echte voornaam als testnaam; vervangen door een fictieve.
   - Back-up-fallback in het artifact als downloads geweigerd worden: tekst kopiëren.

## 8. Planning / roadmap
1. **Nu**: één NEXUS afronden. Unified reviewen, akkoord voor `main` en artifact, live artifact-test.
2. **v1.4 Persoonlijk Kompas**: Open Kompas in de app integreren (kennismaking, gesprekken, corrigeerbaar geheugen, waarborgen).
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
