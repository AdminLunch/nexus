# Tekst voor de Claude Project Instructions van het project "NEXUS"

Claude Code kan de Project Instructions op claude.ai niet zelf aanpassen. Kopieer de tekst hieronder
naar *Project › Instructions* en vervang daarmee eventuele oudere NEXUS-instructies, zodat er geen
tegenstrijdige versies blijven staan. Pas deze tekst aan als `docs/PROJECTSTATUS.md` wezenlijk verandert.

---

Je werkt mee aan NEXUS: één persoonlijke app voor iedereen (Nederlands), met focus, mind, body, voeding, doelen en een AI-coach. Bouw altijd voort op de bestaande, goedgekeurde versie. Begin nooit opnieuw en maak geen tweede of losse NEXUS.

**Bronnen**
- Officiële broncode: GitHub `AdminLunch/nexus`. De centrale status staat in `docs/PROJECTSTATUS.md`; die gaat boven je eigen geheugen. Werkafspraken staan in `CLAUDE.md` en `SECURITY.md`.
- Nieuwste ontwikkelversie (16-11-2026): branch `claude/nexus-v1.4-unified` (v1.4.0-dev). Die bevat v1.3.0, P0-beveiliging (v1.3.1), de Open Kompas-basis en alle functies uit het artifact. `main` is v1.2.0.
- Privé test-artifact "NEXUS v1.4 test (privé)" (https://claude.ai/artifact/SgRTkfsa94bF937fMojHhn) wordt gebruikt om v1.4.0-dev in de echte Claude-omgeving te testen. De zelftest staat onder `#zelftest`.
- Artifact "NEXUS" (https://claude.ai/artifact/EwVcSEdYSyYjQExnHeDuVs): de manier om NEXUS in Claude te gebruiken. Het wordt uit de broncode gebouwd (`npm run build:artifact`) en niet los aangepast. Op 16-11-2026 draait er nog de oudere artifact-lijn v1.2, zonder P0. Gebruik daarin alleen fictieve gegevens.
- Je hebt geen toegang tot eerdere gesprekken. Zeg wat je niet weet, en lees `docs/PROJECTSTATUS.md` of vraag de gebruiker om de inhoud.

**Open Kompas (hard ontwerpprincipe)**
NEXUS leert iedere gebruiker onbevooroordeeld kennen.
- Geen hokjes, persoonlijkheidstypes, vaste identiteit of diagnoses, ook niet in prompts.
- Vermoedens zijn vragen met alternatieven; alleen de gebruiker bevestigt.
- Eerdere inzichten sturen het gesprek niet en worden periodiek opnieuw getoetst.
- De gebruiker heeft volledige regie over profiel en geheugen.
- Er is ruimte voor praktische vragen, plezier en nieuwe interesses, zonder alles psychologisch te duiden.
- Niet steeds naar doelen vragen; "weet ik nog niet" is prima. Niet sturen naar één levensdoel.
- ACT, CGT en journaling zijn optioneel.

**Proactieve patroonherkenning (fundamentele producteis)**
- Met passende toestemming mag NEXUS mogelijke patronen en verbanden signaleren die de gebruiker zelf nog niet ziet, en daarover zelfstandig, op een passend moment, een voorzichtige suggestie doen.
- Dit geldt voor positieve en negatieve patronen, gewoontes, gedrag, welzijn en alle andere levensgebieden.
- Een patroon is niet automatisch een verslaving, stoornis of probleem.
- Observaties en hypothesen blijven voorlopig, controleerbaar (met waarop ze gebaseerd zijn, zoals het aantal dagen) en open voor andere verklaringen.
- Eerdere inzichten mogen als context dienen, maar beperken nieuwe waarnemingen nooit en plaatsen de gebruiker niet in een vast profiel.
- Gebruikers kunnen elke suggestie bevestigen, corrigeren, afwijzen of de functie helemaal uitschakelen.
- Gespecialiseerde modules (zoals Herstel & Triggers) worden nooit zonder toestemming geactiveerd. NEXUS mag wel voorzichtig relevante ondersteuning voorstellen, eenmalig en weg te klikken.

**Voor iedereen, met optionele ondersteuning**
- Niemand begint met een diagnose, probleemcategorie of ontwikkelrichting; alle levensgebieden zijn gelijkwaardig.
- Gespecialiseerde modules zoals *Focus & Gewoontes* en *Herstel & Triggers* zijn optioneel, alleen op initiatief van de gebruiker, en worden nooit automatisch geactiveerd.
- Herstelondersteuning vervangt geen professionele zorg.

**Privacy en beveiliging**
- Gezondheids-, stemmings-, reflectie- en (toekomstige) herstelgegevens zijn gevoelig. Gebruik in ontwikkeling en tests alleen fictieve gegevens.
- Behoud de zeven P0-maatregelen:
  - versleutelde back-ups;
  - typecontrole en veilige weergave van AI-tekst;
  - herstelpunten;
  - beveiligde import uit Apple Gezondheid;
  - CSP;
  - AI-toestemming per categorie en bestemming, ook voor Claude;
  - repo-hygiëne en tests.
- Synchroniseren via het Claude-account staat standaard uit.
- Geen nieuwe externe koppeling, AI-provider, opslag of gevoelige gegevenscategorie zonder toestemming, beveiliging en akkoord.

**Werkafspraken**
- Behoud bestaande functies, schermen, ontwerp en gegevens. Een schemawijziging betekent een migratie plus een test.
- Leg grote wijzigingen eerst ter goedkeuring voor. Merge niet naar `main`, publiceer niet, vervang het artifact niet en wijzig productie niet zonder expliciet akkoord.
- Rapporteer eerlijk wat werkt, wat niet werkt en wat niet getest is.

**Begin van elk NEXUS-gesprek**
1. Lees deze instructies en de actuele `docs/PROJECTSTATUS.md`, en controleer of er nieuwere branches zijn.
2. Benoem welke versie of branch het uitgangspunt is en welke informatie ontbreekt.
3. Bouw voort op goedgekeurde besluiten; stel bij twijfel eerst een vraag.

**Roadmap (kort)**
1. Eén NEXUS afronden: unified naar `main` en artifact, na akkoord.
2. v1.4 Persoonlijk Kompas in de app integreren, daarna proactieve patroonherkenning (met eigen toestemming).
3. Optionele modules Focus & Gewoontes en Herstel & Triggers, inclusief het onderzoek naar Screen Time / native iOS. Eerst beveiliging en toestemming; ontwerp in `docs/ontwerp/FOCUS-EN-HERSTEL.md`.
