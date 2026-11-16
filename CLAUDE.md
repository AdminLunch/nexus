# CLAUDE.md — NEXUS

**Begin elke sessie met** `docs/PROJECTSTATUS.md` (versie, branches, besluiten, open punten, planning)
en `SECURITY.md`. Die zijn leidend. Dit bestand bevat alleen de vaste werkafspraken.
Controleer met `git fetch` of er nieuwere branches zijn en ga niet alleen af op versienummers.
Je hebt geen toegang tot eerdere gesprekken: zeg wat je niet weet.

## Project
NEXUS is één persoonlijke app voor iedereen (Nederlands): focus, mind, body, voeding, doelen en AI-coach.
Het is een statische PWA in vanilla ES-modules, zonder build; de gegevens staan lokaal.
- Eén broncode: het Claude-artifact "NEXUS" wordt hieruit gebouwd met `npm run build:artifact`.
- Bewerk het artifact nooit los en maak geen tweede NEXUS, losse app of dubbel gebruikersprofiel.
- Bestaande functies, schermen, navigatie, ontwerp en gegevens blijven behouden.
- Een schemawijziging betekent altijd een migratie plus een test, ook met gegevens in artifact-vorm.

## Open Kompas (hard ontwerpprincipe, voor code, prompts, AI-geheugen, profielen en tekst)
- Geen hokjes, persoonlijkheidstypes, vaste identiteit of diagnoses, ook niet hardgecodeerd in prompts.
- Vermoedens zijn vragen, nooit feiten. Houd alternatieven open; alleen de gebruiker bevestigt.
- De gebruiker heeft volledige regie over profiel en geheugen: inzien, aanpassen, archiveren en wissen.
- Praktische vragen, plezier en nieuwe interesses niet psychologisch duiden. Niet steeds naar doelen vragen en niet sturen naar één levensdoel.
- ACT, CGT, journaling en gespecialiseerde modules (zoals herstel) zijn alleen optioneel en op initiatief van de gebruiker. Ze worden nooit automatisch geactiveerd of als standaard aangenomen.
- **Proactieve patroonherkenning** (met toestemming): NEXUS mag zelf, op een passend moment, voorzichtig mogelijke patronen benoemen, zowel positief als negatief en in alle levensgebieden.
  - Altijd als controleerbare mogelijkheid, met onderbouwing en alternatieven.
  - Nooit als verslaving, stoornis of probleem-etiket.
  - Eerdere inzichten zijn context, nooit een filter.
  - De gebruiker kan bevestigen, corrigeren, afwijzen of uitzetten.
  - Modules mag NEXUS voorstellen, maar nooit zelf activeren.
- Details en waarborgen: `docs/open-kompas/ONTWERP.md` en `docs/ontwerp/FOCUS-EN-HERSTEL.md`.

## Privacy en beveiliging
- Gebruik alleen fictieve testgegevens. Echte back-ups, gezondheidsexports, sleutels of dagboekteksten horen niet in git, tests of screenshots.
- De P0-maatregelen mogen niet zwakker worden. Externe AI krijgt alleen wat via `js/privacy/consent.js` is toegestaan.
- Toon AI-tekst nooit als ruwe HTML (`safeHtml`). Valideer nieuwe velden in `js/schema.js`.
- Gebruik geen `confirm`, `alert` of `prompt` maar `ask()` uit `ui.js`: dat werkt ook in het artifact.
- Voeg geen nieuwe externe koppeling, AI-provider, opslag of gevoelige gegevenscategorie toe zonder eigen toestemming, beveiliging en akkoord.

## Werkwijze
- Leg grote wijzigingen eerst als voorstel voor. Wijzig `main`, productie of het artifact niet zonder expliciet akkoord. Onderzoek en niet-destructief werk op een eigen branch mogen.
- Werk op een eigen branch of worktree en raak andermans lopende branches niet aan.
- Tests:
  - `npm test` voor unit- en Open Kompas-tests.
  - `npm run test:smoke` met een server op :8080.
  - `npm run test:artifact`.
  - `npm run test:upgrade`.

  Rapporteer de resultaten eerlijk.
- Werk `docs/PROJECTSTATUS.md` bij na elk afgerond onderdeel of besluit.
