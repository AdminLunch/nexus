# Beveiliging en privacy — werkafspraken

NEXUS bewaart gevoelige gegevens (stemming, slaap, hartslag, voeding, reflecties) alleen op het
toestel van de gebruiker. Deze repository bevat uitsluitend code en kan publiek zijn.

## Nooit in git, issues, tests of screenshots
- Echte back-upbestanden (`nexus-backup-*.json`), ook niet versleuteld.
- Echte gezondheidsexports (tekst met `NEXUS-HEALTH`).
- API-sleutels, wachtwoorden, tokens.
- Dagboek- of reflectieteksten van echte personen.

Tests en demo-data gebruiken alleen synthetische gegevens. `.gitignore` blokkeert de bekende
bestandsnamen van back-ups; controleer bij twijfel `git status` vóór een commit.

## Een kwetsbaarheid melden
Meld een beveiligingsprobleem niet in een openbaar issue. Neem rechtstreeks contact op met de
beheerder van de repository via een privébericht op GitHub. Beschrijf wat je zag, zonder echte
gegevens mee te sturen.

## Huidige maatregelen (v1.3.1, behouden in v1.4.0-dev)
- Back-ups standaard versleuteld (AES-GCM, PBKDF2 600.000 rondes); API-sleutel nooit in een
  onversleutelde back-up.
- Typecontrole van alle opgeslagen en geïmporteerde gegevens; AI-antwoorden alleen met veilige opmaak.
- Herstelpunten vóór herstellen, demo-data en alles wissen.
- Klembord leeg na import uit Apple Gezondheid; grenzen op geïmporteerde waarden.
- Content-Security-Policy: alleen eigen scripts, geen inline scripts.
- AI: niets wordt gedeeld zonder toestemming per categorie en per server; voorvertoning van wat er gaat;
  lokaal logboek (zonder inhoud). Reflecties, maaltijdnamen en metingen per dag gaan nooit mee.

## Aanvullingen in v1.4.0-dev (verenigde versie met het Claude-artifact)
- Claude (via het eigen Claude-account in het artifact) is een externe AI: dezelfde toestemming per
  categorie, met bestemming `claude.ai`. Zonder keuze gaat er niets naar Claude.
- Nooit gedeeld, ook niet met alles aan: ook gedachten-notities, maaltijdplanning en het Open Kompas-profiel.
- Geen vaste aannames over de gebruiker (zoals een diagnose) in AI-prompts; een unit-test bewaakt dit.
- Synchroniseren via het Claude-account staat standaard UIT en kan alleen bewust worden aangezet;
  de API-sleutel gaat nooit mee. De kopie kan vanuit Instellingen worden gewist.
- Geen `confirm()`/`alert()`: eigen dialoogvenster (werkt ook in een artifact).
- Artifact-verpakking (`tools/build-artifact.mjs`) laat de eigen CSP-meta weg: claude.ai legt een eigen
  CSP op (geen externe verbindingen, alleen eigen bestanden en vaste CDN's), maar die staat inline scripts
  wél toe. De PWA houdt de strenge CSP. Zie `docs/PROJECTSTATUS.md` (open punt).
- Gevoelige gegevens over verslaving, middelengebruik, triggers en herstel: nog niet gebouwd. Eerst eigen
  toestemmingscategorieën, versleuteling op het toestel en wisbeleid (zie `docs/ontwerp/FOCUS-EN-HERSTEL.md`).

## Tests draaien
```
npm install            # alleen Playwright, voor de rooktest
npm test               # unit-tests + Open Kompas-tests (Node, zonder browser)
python3 -m http.server 8080 &
npm run test:smoke     # rooktest in iPhone-emulatie (PW_CHROMIUM_PATH optioneel)
npm run test:artifact  # artifact-verpakking met nagebootste Claude-runtime
```
