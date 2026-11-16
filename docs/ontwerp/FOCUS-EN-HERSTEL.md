# Ontwerpvoorstel — optionele modules *Focus & Gewoontes* en *Herstel & Triggers*

Status: **voorstel, niet gebouwd.** Eerst afronden: één NEXUS (unified), live artifact-test, Open Kompas-integratie.
Implementatie pas na akkoord en na controle van de beveiliging, architectuur en bestaande functionaliteit.
Omvat ook het eerdere idee *NEXUS Focus & Triggers*.

## 0. Productuitgangspunt
**Eén NEXUS voor iedereen, met extra ondersteuning voor wie daar zelf voor kiest.**
- Iedere nieuwe gebruiker begint zonder diagnose, probleemcategorie of ontwikkelrichting. De bestaande levensgebieden blijven gelijkwaardig.
- Verslaving of herstel is nooit het standaard uitgangspunt. Er komt geen aparte verslavingsapp en geen tweede profiel.
- Beide modules zijn *opt-in*: ze staan uit, worden nergens automatisch voorgesteld op basis van gedrag en zijn altijd uit te zetten, met wissen van hun gegevens.

## 1. Open Kompas: harde voorwaarden (testbaar)

| Eis | Hoe afgedwongen |
|---|---|
| Geen automatische diagnoses of indeling als "verslaafd" | Taalcontrole (`js/kompas/guards.js` → `lintOutgoing`) op alle teksten, ook AI. Geen labels in datamodel of prompts. Unit-test op prompts |
| Geen verplichte vragen over verslaving | Geen kennismakingsvraag over middelen of verslaving. De module verschijnt alleen via Instellingen › Modules of als de gebruiker er zelf om vraagt |
| Geen automatische activatie | `settings.modules.herstel` kan alleen via een expliciete gebruikersactie op `true`; test: geen enkele codepad zet hem anders aan |
| Geen definitieve conclusies uit patronen | Patronen worden getoond als "samenhang, n = …" met alternatieven, nooit als oordeel of etiket |
| Gebruiker kiest zelf welke ondersteuning | Per onderdeel aan/uit: blokkades, triggers, plan en voortgang los van elkaar |
| Andere levensgebieden blijven beschikbaar | Modules voegen een onderdeel toe en vervangen geen schermen. Home blijft gelijk tenzij de gebruiker een tegel toevoegt |
| Doelen en voorkeuren mogen veranderen | Alles is te bewerken, te archiveren of te wissen, zonder streak-verlies-straf |

## 2. Module A — Focus & Gewoontes (voor iedereen)
Doel: vrijwillig minder afleiding, met eigen keuzes.

- **Afleidingen herkennen.** De gebruiker benoemt zelf wat afleidt (app, site of gewoonte). NEXUS stelt hoogstens als vraag voor: "Je noemde vaak X, wil je daar iets mee?" Geen automatische detectie van surfgedrag.
- **Focusschema's en limieten**: zelfgekozen tijdvakken, zoals "werkdagen 9–12", plus daglimieten per categorie.
- **Blokkeren** (zie §4, techniek): tijdelijk of volgens schema, altijd zelf ingesteld.
- **Bij een blokkade (optioneel)**:
  - een korte reflectie: "Wat zocht je net?";
  - of een zelfgekozen alternatief: even lopen, water, iemand bellen;
  - zonder oordeel en zonder tellerstand-schaamte.
- **Gewoontes**: de bestaande gewoontetracker wordt uitgebreid ("gewoonte om af te bouwen" naast "op te bouwen").
- **Wijzigen en opheffen**: altijd mogelijk en toegankelijk.
  - Een optionele "bedenktijd" (bijvoorbeeld 30 seconden) kiest de gebruiker zelf. Er is geen slot dat de gebruiker buitensluit.
  - Een noodknop werkt altijd.

## 3. Module B — Herstel & Triggers (alleen op eigen initiatief)
Aanvullende ondersteuning, **geen vervanging van professionele verslavingszorg**. Er staat een duidelijke verwijzing naar hulp:
- huisarts;
- Jellinek / verslavingszorg;
- 113 en 112 bij acute nood.

| Onderdeel | Inhoud |
|---|---|
| Triggers | Zelf vastgelegd, met optionele context: tijdstip, emotie, situatie, omgeving. Vrije tekst, geen vaste categorieën als waarheid |
| Plan voor sterke drang | Eigen stappen ("als … dan …"), eigen alternatieven en een eigen contactpersoon. Met één tik bereikbaar |
| Terugvalpreventieplan | Waarschuwingssignalen, wat helpt, wie te bellen. Gebaseerd op gangbare RPT-structuur, volledig zelf in te vullen |
| Vrijwillige blokkades | Hergebruikt module A; de gebruiker koppelt zelf apps of sites aan een trigger |
| Voortgang (optioneel) | Neutraal ("dagen volgens je plan", "momenten doorgekomen"). Een terugval is informatie, geen reset-met-straf. Telling kan uit |
| Steun betrekken | Alleen op initiatief van de gebruiker: zelf een bericht of samenvatting delen. NEXUS stuurt nooit zelf iets naar derden |

## 4. Techniek blokkeren (onderzoek)
- **Web of PWA en het Claude-artifact** kunnen andere apps of sites **niet** blokkeren; dat is beperkt door de browser-sandbox. Ze kunnen alleen plannen, herinneren en reflecteren.
- **iOS**: Apple's Screen Time API vraagt om een **native iOS-component** (Swift, met FamilyControls + ManagedSettings + DeviceActivity, gebruik "individual" authorization).
  - Gebruikers kiezen apps of sites via `FamilyActivityPicker`; NEXUS krijgt alleen ondoorzichtige tokens en ziet geen surfgeschiedenis.
  - Vereist het FamilyControls-entitlement (aanvragen bij Apple), een betaald Apple Developer-account en App Store-distributie.
- **Koppeling met NEXUS**:
  - De native app beheert de blokkades.
  - NEXUS (PWA of artifact) bewaart alleen de *wens*, zoals "focusschema werkdagen 9–12".
  - Uitwisseling via deep link of gedeelde export, zonder server. Eén gebruikersprofiel blijft leidend in NEXUS.
- **Android** (later): Digital Wellbeing kent geen open API vergelijkbaar met Screen Time; mogelijk via een eigen app met UsageStats en Accessibility. Dit is privacygevoelig en apart te beoordelen.
- **Kosten en afhankelijkheden**: een Apple Developer-account kost ongeveer €99 per jaar. Dat wijkt af van "€0" en vraagt een besluit.

## 5. Privacy en beveiliging (vereist vóór bouwen)
Gegevens over verslaving, middelengebruik, triggers en herstel zijn **bijzonder gevoelig** (vergelijkbaar met gezondheidsgegevens, AVG art. 9).
1. **Versleuteling op het toestel**: een aparte sleutel, met een wachtwoord of passkey, voor het herstel-blok (`recovery`).
2. **Eigen toestemmingscategorieën in `consent.js`**, standaard uit en los aan te zetten:
   - `focus` (schema's, limieten — geen namen van apps of sites);
   - `recovery` (triggers, plannen, voortgang).

   Herstelgegevens gaan standaard nooit naar AI. Ook "alles aan" omvat ze niet zonder een aparte, expliciete keuze.
3. **Nooit in de cloud-sync** tenzij apart gekozen. Nooit in een onversleutelde back-up.
4. **Wissen**: "Module uitzetten en alles wissen" verwijdert ook herstelpunten en de cloudkopie van dit blok.
5. **Geen registratie van surfgedrag**; alleen wat de gebruiker zelf invoert.
6. **Discretie**: neutrale naam en icoon (bijvoorbeeld "Steun") en geen meldingen met gevoelige inhoud op het vergrendelscherm.
7. **Veiligheid**: crisisverwijzing (113/112) en geen medisch of doseringsadvies.

## 6. Integratie in de bestaande app
- **Instellingen › Modules**: aan en uit per module, met uitleg en het wis-pad.
- **Datamodel**: `modules: { focus: {...}, herstel: {...versleuteld} }` in dezelfde staat, met migratie en typecontrole.
- **Mind en Persoonlijk Kompas**: triggers en plannen zijn *eigen invoer* (laag "Wat je me vertelde"). Hypotheses van NEXUS blijven onbevestigd en volgen de bestaande Open Kompas-regels. Herstel wordt nooit ongevraagd in andere gesprekken betrokken (`allowRecall`).
- **Home**: alleen een tegel als de gebruiker die toevoegt.

## 7. Voorgestelde volgorde
1. Unified en het artifact afronden (lopend).
2. Open Kompas integreren.
3. Infrastructuur: versleuteld modulblok, toestemmingscategorieën, wisbeleid en tests.
4. Focus & Gewoontes zonder blokkeren (schema's, reflectie, alternatieven, af te bouwen gewoontes) in PWA en artifact.
5. Herstel & Triggers (plan, triggers, terugvalpreventie, neutrale voortgang), met inhoudelijke review door een professional.
6. Onderzoek en prototype van de native iOS-component (Screen Time), na een besluit over account en kosten.
