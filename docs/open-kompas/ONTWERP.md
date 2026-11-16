# NEXUS v1.4 — Open Kompas: basismodule

Status: **prototype, nog niet geïntegreerd**. Gebouwd op branch `claude/nexus-v1.4-open-kompas` (basis v1.3.0); sinds 16-11-2026 opgenomen in `claude/nexus-v1.4-unified` (met P0). Actuele stand: `docs/PROJECTSTATUS.md`.
Er zijn geen bestaande bestanden gewijzigd: `store.js`, `app.js`, `js/ai/`, `sw.js` en `index.html` zijn onaangeroerd.

## 1. Wat is er gebouwd

| Bestand | Rol |
|---|---|
| `js/kompas/memory.js` | Corrigeerbaar persoonlijk geheugen (lagen, statussen, regie, verval, herijking, validatie) |
| `js/kompas/conversation.js` | Adaptieve gespreksmotor: open kennismaking, zes vaste stuurkeuzes, praktische modus, oefeningen, veiligheid |
| `js/kompas/guards.js` | Waarborgen tegen aannames en tunnelvisie (taalcontrole + gedragsbudgetten, `POLICY`) |
| `js/kompas/topics.js` | Lokale, transparante herkenning van onderwerp, domein en bedoeling; bewaarvoorstellen; citaten |
| `js/kompas/toolbox.js` | Optionele hulpmiddelen: journaling, ACT, CGT, “kleinste volgende stap” |
| `js/kompas/context.js` | Geminimaliseerde context voor een toekomstige AI-laag (wordt nu nergens verstuurd) |
| `js/kompas/storage.js` | Opslagpoort (adapter-interface), in-memory adapter, `applyOps`, repository met validatie |
| `js/kompas/index.js` | Publieke ingang |
| `prototype/open-kompas/` | Afzonderlijk prototypescherm (gesprek + “Mijn Kompas” + waarborgenpaneel) |
| `tests/kompas/` | Unit-tests (`node:test`) en een Playwright-rooktest voor het prototype |

Alle kernmodules zijn **puur**: geen DOM, geen `localStorage`, geen netwerk, geen imports buiten `js/kompas/`.
Tijd (`now`) en id-generatie (`idGen`) zijn injecteerbaar, waardoor alles deterministisch te testen is.
Een test (`context-isolation.test.mjs`) bewaakt die isolatie.

**Prototype openen:** start in de projectmap `python3 -m http.server 8080` en open
`http://localhost:8080/prototype/open-kompas/`. Het scherm is niet gelinkt vanuit de app en niet opgenomen in de service-worker-cache.

## 2. Adaptieve gespreksstructuur

De motor is een pure functie: `respond(sessie, geheugen, invoer) → { sessie, antwoord, memoryOps }`.
Hij schrijft zelf niets weg; geheugen-operaties zijn altijd het gevolg van een keuze van de gebruiker.

**Open kennismaking.** Geen vragenlijst, geen categorieën. De opening zegt dat niets hoeft, en biedt:
*Ik vertel waarom ik hier ben* · *Ik begin gewoon ergens* · *Ik weet het nog niet* · *Iets praktisch regelen* · *Wat doe je met wat ik vertel?*.
“Ik weet het nog niet” is een volwaardig antwoord: het zet doelvragen 21 dagen op stil.

**Zes vaste keuzes onder elk antwoord** (`CORE_ACTIONS`), ook herkend in vrije tekst:

| Keuze | Gedrag |
|---|---|
| Hier verder op | Vervolgvraag op hetzelfde onderwerp, met een citaat uit de eigen woorden |
| Andere invalshoek | Andere lens (concreet, wat gaat goed, tijd, anderen, nieuwsgierigheid, makkelijker; psychologische lenzen alleen waar passend). Nooit dezelfde vraag twee keer |
| Over iets heel anders | Onderwerp losgelaten (“declined”), NEXUS haalt het die sessie niet terug; open, luchtige vraag |
| Praktische oplossing | Praktische modus: probleem → wat is er al → kleinste stap → wanneer → samenvatting. Nooit psychologische duiding. Via de knop neemt NEXUS niet aan waar het over gaat, maar biedt het vorige onderwerp hoogstens aan |
| Vraag overslaan | Geen uitleg nodig; de vraag komt die sessie niet terug. Een overgeslagen verband wordt 21 dagen niet opnieuw geopperd |
| Dit klopt niet | NEXUS trekt terug, vraagt naar de eigen versie (optioneel te bewaren in eigen woorden), onderdrukt het verband 365 dagen en reflecteert niet direct opnieuw |

**Gespreksbewegingen** (`move`): `intro`, `listen`, `deepen`, `angle`, `switch`, `practical`, `skip`, `correction`,
`reflect` (mogelijk verband), `recall`, `review`, `goal`, `tool-offer`, `tool`, `safety`.

**Aansluiten op de gebruiker.** Vervolgvragen citeren de eigen woorden (`echoPhrase`). Een mogelijk verband
verbindt alleen twee *eigen uitspraken* van de gebruiker en wordt als vraag voorgelegd, met twee alternatieven:
*Ja, dat klopt* → inzicht · *Misschien, bewaar* → onbevestigd verband · *Nee* → onderdrukt · *Laat maar* → tijdelijk onderdrukt.

**Veiligheid.** Bij signalen van suïcidaliteit stopt de verkenning en verwijst NEXUS naar 113 (0800-0113, 113.nl) en 112,
zonder diagnose. Dit is een minimale vangnetregel; de definitieve tekst en het protocol horen bij P0 en vakinhoudelijke review.

## 3. Ontwerp van het persoonlijke geheugen

```
entry = { id, type, text, origin: 'user'|'nexus', status, topics[], createdAt, updatedAt,
          lastConfirmedAt, reviewAfter, history[], alternatives[]*, evidence[]*, expiresAt* }   (* alleen bij 'possible')
```

| Laag (`type`) | Betekenis | Herkomst |
|---|---|---|
| `told` | Wat de gebruiker zelf expliciet vertelde | gebruiker |
| `value` | Wat de gebruiker belangrijk vindt | gebruiker |
| `interest` | Waar de gebruiker nieuwsgierig naar is / plezier in heeft | gebruiker |
| `possible` | Mogelijk verband, **onbevestigd** | NEXUS — altijd met ≥1 alternatief |
| `insight` | Inzicht dat de gebruiker bevestigde of zelf formuleerde | gebruiker |

Statussen: `active`, `outdated` (verouderd), `corrected` (klopt niet), `deleted` (inhoud gewist; alleen een lege grafsteen, `purge` wist ook die).

Harde regels (afgedwongen in code én in `validate()`):
- Alleen `by: 'user'` kan bevestigen, corrigeren, bewerken, verouderd markeren, terugzetten, wissen. NEXUS kan een verband nooit zelf bevestigen.
- Een `possible` moet van NEXUS komen en een alternatief hebben; een `insight` moet een bevestiging door de gebruiker hebben.
- Niets wordt onthouden zonder klik: herkende uitspraken (“ik vind eerlijkheid belangrijk”) worden alleen als *voorstel* getoond.
- Bewerken van een verband maakt het niet bevestigd.
- Verwijderen wist tekst, onderwerpen en geschiedenis daadwerkelijk.

Tegen vastroesten:
- Onbevestigde verbanden **verlopen** na 30 dagen (`expireStale`).
- Elk item heeft een **herijkingsdatum** (`REVIEW_DAYS`); NEXUS vraagt hoogstens één keer per sessie “klopt dit nog?”, met *Klopt nog / Niet meer / Later*. Onbevestigde verbanden worden nooit als “we noteerden” teruggehaald.
- Afgewezen verbanden worden via een woord-handtekening onderdrukt (≥70% overlap = zelfde verband).

## 4. Bescherming tegen aannames en tunnelvisie

**Taalcontrole (`lintOutgoing`)** op élk antwoord. Bij een schending valt de motor terug op een neutrale zin.
- Geen identiteitslabels (“je bent een…”, “jij bent iemand die…”, “typisch jij”, persoonlijkheidstypes).
- Geen diagnoses/stoornistermen, tenzij de gebruiker het woord zelf gebruikte.
- Geen hypothese als feit (“het komt doordat…”, “diep van binnen…”); hypotheses moeten een voorzichtige formulering hebben.
- Geen sturing naar één levensdoel (“je roeping”, “je ware doel”, “je moet eigenlijk gaan…”).

**Gedragsbudgetten (`POLICY`)**, allemaal instelbaar:

| Risico | Waarborg |
|---|---|
| Alles psychologisch duiden | Duiding alleen in domeinen waar de gebruiker zelf gevoels-/betekeniswoorden gebruikt; nooit bij praktisch, werk-logistiek, hobby, plezier, gezondheid; max. ~1/3 van de beurten; minstens 3 beurten ertussen; na “klopt niet” eerst luisteren |
| Steeds terugkomen op hetzelfde | NEXUS haalt per sessie hoogstens 1× zelf iets uit het geheugen terug, nooit een losgelaten onderwerp; na 3 beurten op één onderwerp wordt expliciet ruimte voor iets anders geboden; `tunnelReport` meet het |
| Verleden bepaalt het gesprek | Vervolgsessies openen open (“mag iets heel anders zijn”), met hoogstens één suggestie uit het geheugen |
| Nieuwe interesses blokkeren | Luchtige, niet-psychologische open vragen; interesses zijn een eigen laag; “Over iets heel anders” altijd beschikbaar |
| Doelen pushen | Geen doelvragen in de eerste sessie, alleen als de gebruiker er zelf over begint, max. 1 per sessie, 21 dagen stilte na “weet ik niet” |
| ACT/CGT als verplichte route | Alleen op verzoek, of max. 1× per sessie bij passend onderwerp; altijd vrijblijvend; *Liever geen oefeningen* zet het uit; antwoorden worden niet bewaard |

## 5. Testresultaten

```
node --test tests/kompas/*.test.mjs
  # pass 45, # fail 0
  (geheugen 13, waarborgen/herkenning 12, gesprek 17, AI-context/opslag/isolatie 3)

python3 -m http.server 8080 &
node tests/kompas/prototype.smoke.mjs http://localhost:8080/prototype/open-kompas/
  21/21 geslaagd — o.a. geen externe netwerkverzoeken, geen localStorage, geen JS-fouten
```

De bestaande app-rooktest (`tests/smoke.mjs`) is ongewijzigd en raakt deze module niet. In deze omgeving slaagt die
42–43 van de 44 checks; de wisselende mislukking (“Dagscore reageert”) is een timingkwestie in de bestaande test die
al op v1.3.0 bestond, niet veroorzaakt door deze branch (er zijn geen bestaande bestanden aangepast).

Alle testdata is synthetisch (`tests/kompas/fixtures.mjs`, fictieve persoon “Sam”).

## 6. Pas na P0 te integreren

| Onderdeel | Wat er nu is | Wat P0 moet leveren / wat dan volgt |
|---|---|---|
| Opslag | Alleen `createInMemoryAdapter()` | Versleutelde adapter met `load/save/wipe` (string-JSON); `createKompasRepository(adapter)` valideert al bij laden/opslaan |
| Toestemming | Alleen gedeclareerd: `REQUIRED_CONSENT_SCOPES = ['kompas.memory.read']` | P0-consent bepaalt of geheugen bewaard en of het aan een AI-provider gegeven mag worden; geen eigen consentmechanisme gebouwd |
| AI-context | `buildKompasContext()` met dataminimalisatie, regels en ONBEVESTIGD-labels | Koppelen aan de beveiligde AI-laag; uitgaande AI-antwoorden óók door `lintOutgoing` halen; bevestigingen blijven via knoppen lopen |
| App-integratie | Los prototypescherm | Tab/route in `app.js`, eventueel export/wissen via `store.js`, opname in `sw.js`-cache — pas na P0, om conflicten te vermijden |
| Verwijderen & export | `remove`/`purge`/`wipeAll` in geheugen | Doorvoeren in de beveiligde opslag, back-ups en exports (inclusief grafstenen voor sync) |
| Veiligheidstekst | Minimale 113/112-verwijzing | Inhoudelijke review en eventueel protocol |
| Bestaande AI-engine | Niet aangeraakt | Bestaande `js/ai/engine.js` blijft voor commando’s; Open Kompas wordt een aparte gesprekslaag |

Nog niet samengevoegd met `main` of de beveiligingsbranch.
