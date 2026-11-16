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

## Huidige maatregelen (v1.3.1)
- Back-ups standaard versleuteld (AES-GCM, PBKDF2 600.000 rondes); API-sleutel nooit in een
  onversleutelde back-up.
- Typecontrole van alle opgeslagen en geïmporteerde gegevens; AI-antwoorden alleen met veilige opmaak.
- Herstelpunten vóór herstellen, demo-data en alles wissen.
- Klembord leeg na import uit Apple Gezondheid; grenzen op geïmporteerde waarden.
- Content-Security-Policy: alleen eigen scripts, geen inline scripts.
- AI: niets wordt gedeeld zonder toestemming per categorie en per server; voorvertoning van wat er gaat;
  lokaal logboek (zonder inhoud). Reflecties, maaltijdnamen en metingen per dag gaan nooit mee.

## Tests draaien
```
npm install            # alleen Playwright, voor de rooktest
npm test               # unit-tests (Node, zonder browser)
python3 -m http.server 8080 &
npm run test:smoke     # rooktest in iPhone-emulatie (PW_CHROMIUM_PATH optioneel)
```
