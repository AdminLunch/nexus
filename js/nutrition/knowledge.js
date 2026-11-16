// NEXUS — kennisbank ADHD & voeding.
// Bewijsniveaus:
//   bewezen     = wetenschappelijk aangetoond (consistente, goed opgezette studies of vaststaande fysiologie)
//   aannemelijk = er zijn aanwijzingen, maar effecten zijn klein, wisselend of niet specifiek voor ADHD
//   onvoldoende = onvoldoende onderzocht of tegenstrijdig; geen conclusies mogelijk
// Voeding is nooit een bewezen behandeling voor ADHD.

export const LEVELS = {
  bewezen: { l: 'Aangetoond', c: 'g', d: 'Consistent wetenschappelijk bewijs of vaststaande fysiologie.' },
  aannemelijk: { l: 'Aannemelijk', c: 'a', d: 'Aanwijzingen, maar kleine of wisselende effecten.' },
  onvoldoende: { l: 'Onvoldoende onderzocht', c: 'v', d: 'Te weinig of tegenstrijdig onderzoek.' },
};

export const DISCLAIMER = 'Deze informatie ondersteunt je eigen keuzes. Voeding is géén bewezen behandeling voor ADHD en vervangt geen zorg, therapie of medicatie. Wil je supplementen gebruiken, iets aan je medicatie veranderen of je bloed laten onderzoeken? Overleg met je huisarts, psychiater of een diëtist.';

export const TOPICS = [
  {
    id: 'dopamine', t: 'Voeding en dopamine', e: '⚡',
    intro: 'Dopamine speelt een rol bij motivatie, beloning en aandacht — thema\'s die bij ADHD vaak lastig zijn.',
    claims: [
      ['bewezen', 'Het lichaam maakt dopamine uit het aminozuur tyrosine, dat uit eiwitrijke voeding komt (of uit fenylalanine wordt gemaakt).'],
      ['bewezen', 'ADHD-medicatie werkt onder meer via dopamine en noradrenaline in de hersenen. Voeding werkt niet op die manier en is geen vervanging.'],
      ['onvoldoende', 'Dat extra tyrosine uit voeding of supplementen ADHD-klachten vermindert, is niet aangetoond. Het lichaam regelt de dopamineaanmaak grotendeels zelf.'],
    ],
    tip: 'Eiwit bij elke hoofdmaaltijd is een veilige, haalbare basis — zonder supplementen.',
  },
  {
    id: 'bloedsuiker', t: 'Bloedsuiker en energie', e: '📈',
    intro: 'Hoe snel suikers in je bloed komen, bepaalt mede hoe stabiel je energie over de dag is.',
    claims: [
      ['bewezen', 'Maaltijden met eiwit, vezels en vet geven een geleidelijker bloedsuikerverloop dan snelle suikers alleen.'],
      ['bewezen', 'Suiker veroorzaakt geen ADHD. In dubbelblinde studies werden kinderen na suiker niet aantoonbaar drukker.'],
      ['bewezen', 'ADHD-stimulantia verminderen vaak de eetlust; maaltijden schieten er daardoor makkelijk bij in.'],
      ['aannemelijk', 'Regelmatig eten en ontbijten helpt dips en prikkelbaarheid door honger te voorkomen. Onderzoek naar ontbijt en concentratie (vooral bij kinderen) wijst die kant op, maar is niet eenduidig.'],
    ],
    tip: 'Gebruik je medicatie? Eet je ontbijt vóórdat die gaat werken, en plan een vast eetmoment voor later op de dag.',
  },
  {
    id: 'eiwit', t: 'Eiwitten en aminozuren', e: '🥚',
    intro: 'Eiwitten bestaan uit aminozuren: bouwstoffen voor spieren, enzymen en signaalstoffen in de hersenen.',
    claims: [
      ['bewezen', 'Eiwit verzadigt goed en vertraagt de opname van koolhydraten in dezelfde maaltijd.'],
      ['aannemelijk', 'Een eiwitrijk ontbijt helpt veel mensen om de ochtend stabieler en met minder trek door te komen. Specifiek ADHD-onderzoek hiernaar is beperkt.'],
      ['onvoldoende', 'Aminozuursupplementen (zoals tyrosine of tryptofaan) als behandeling voor ADHD.'],
    ],
    tip: 'Makkelijke eiwitbronnen: eieren, kwark, skyr, kefir, peulvruchten, vis, kip, tofu, noten.',
  },
  {
    id: 'omega3', t: 'Omega 3-vetzuren', e: '🐟',
    intro: 'EPA en DHA zijn omega 3-vetzuren die onderdeel zijn van de celwanden in je hersenen.',
    claims: [
      ['bewezen', 'Vette vis (zalm, makreel, haring, sardines) is de belangrijkste bron van EPA en DHA. De Gezondheidsraad adviseert wekelijks een portie vis, bij voorkeur vette vis.'],
      ['bewezen', 'Plantaardige omega 3 (ALA uit lijnzaad, chiazaad en walnoten) wordt maar beperkt omgezet in EPA en DHA.'],
      ['aannemelijk', 'Meta-analyses vinden een klein gunstig effect van omega 3-suppletie op ADHD-klachten, vooral bij kinderen en vooral met EPA. Het effect is duidelijk kleiner dan dat van reguliere behandeling.'],
      ['onvoldoende', 'Het effect bij volwassenen en de beste dosering.'],
    ],
    tip: 'Eet je geen vis? Overleg dan of een algenolie-supplement zinvol is.',
  },
  {
    id: 'darm', t: 'Darmmicrobioom en ADHD', e: '🦠',
    intro: 'In je darmen leven biljoenen bacteriën die stoffen maken die ook je hersenen kunnen bereiken.',
    claims: [
      ['bewezen', 'Darm en hersenen communiceren met elkaar (de darm-hersen-as), onder meer via zenuwen, het immuunsysteem en stoffen die bacteriën maken.'],
      ['onvoldoende', 'Sommige studies vinden bij ADHD een andere samenstelling van darmbacteriën, maar de uitkomsten verschillen per studie en wat oorzaak en gevolg is, is onduidelijk.'],
      ['onvoldoende', 'Dat het veranderen van je darmflora ADHD-klachten vermindert.'],
    ],
    tip: 'Afwisselend eten met veel plantaardige producten is goed voor je darmen — los van ADHD.',
  },
  {
    id: 'biotica', t: 'Probiotica en prebiotica', e: '🫙',
    intro: 'Probiotica zijn levende bacteriën (bijv. in kefir); prebiotica zijn vezels die als voeding voor die bacteriën dienen.',
    claims: [
      ['bewezen', 'Prebiotische vezels, zoals inuline en resistent zetmeel, worden door darmbacteriën afgebroken en voeden ze.'],
      ['aannemelijk', 'Veel gefermenteerde voeding (kefir, yoghurt, zuurkool, kimchi) kan de diversiteit van darmbacteriën vergroten; een gecontroleerde studie liet dat na tien weken zien.'],
      ['onvoldoende', 'Probiotica-supplementen voor ADHD: een paar kleine studies, zonder eenduidig effect.'],
    ],
    tip: 'Probeer één gefermenteerd product per dag, bijvoorbeeld kefir bij je ontbijt.',
  },
  {
    id: 'vezels', t: 'Vezels en resistent zetmeel', e: '🌾',
    intro: 'Vezels zijn plantaardige stoffen die je dunne darm niet verteert.',
    claims: [
      ['bewezen', 'Vezels zijn goed voor de darmwerking en verzadiging. Het Voedingscentrum adviseert volwassenen 30 tot 40 gram per dag; de meeste mensen halen dat niet.'],
      ['bewezen', 'Resistent zetmeel zit in onrijpe (groene) bananen en ontstaat ook als je aardappels, rijst of pasta na het koken laat afkoelen. Darmbacteriën maken er korteketenvetzuren van.'],
      ['onvoldoende', 'Een direct effect van vezels of resistent zetmeel op ADHD-klachten.'],
    ],
    tip: 'Kleine stappen: havermout, volkoren, peulvruchten, een handje noten, groente bij lunch én avondeten.',
  },
  {
    id: 'slaap', t: 'Slaap, voeding en concentratie', e: '🌙',
    intro: 'Slaap is de basis onder concentratie. Wat en wanneer je eet en drinkt, beïnvloedt je slaap.',
    claims: [
      ['bewezen', 'Slaaptekort verslechtert aandacht, stemming en impulscontrole — ook bij mensen zonder ADHD. Slaapproblemen komen bij ADHD veel voor.'],
      ['bewezen', 'Cafeïne werkt lang na (de helft is na gemiddeld zo\'n 5 uur nog actief) en kan inslapen en slaapkwaliteit verstoren.'],
      ['aannemelijk', 'Laat en zwaar eten vlak voor het slapen kan de slaap verstoren; regelmatige eettijden ondersteunen je dag-nachtritme.'],
      ['aannemelijk', 'Licht vochttekort kan concentratie en stemming negatief beïnvloeden.'],
    ],
    tip: 'Laatste koffie vroeg in de middag, en zet een glas water naast je werkplek.',
  },
  {
    id: 'tekorten', t: 'Tekorten en bloedonderzoek', e: '🩸',
    intro: 'Een tekort aan bepaalde voedingsstoffen kan vermoeidheid en concentratieproblemen geven — met of zonder ADHD.',
    claims: [
      ['aannemelijk', 'In onderzoek worden bij ADHD vaker lagere waarden gevonden van ferritine (ijzervoorraad), vitamine D, zink en magnesium. Dat is samenhang: lang niet iedereen met ADHD heeft een tekort.'],
      ['onvoldoende', 'Supplementen slikken zonder vastgesteld tekort om ADHD-klachten te verminderen.'],
      ['bewezen', 'Te veel ijzer is schadelijk; neem ijzer alleen bij een vastgesteld tekort.'],
    ],
    list: {
      t: 'Bloedonderzoek kan zinvol zijn bij',
      items: [
        'aanhoudende vermoeidheid, lusteloosheid of duizeligheid',
        'weinig of geen vlees en vis (ijzer, vitamine B12)',
        'weinig buiten in de zon, of een donkere huid (vitamine D)',
        'zware menstruaties (ijzer)',
        'als je overweegt om langdurig supplementen te gaan gebruiken',
      ],
      foot: 'De huisarts bepaalt welke waarden zinvol zijn — bijvoorbeeld ferritine, vitamine D, B12 of schildklierwaarden.',
    },
    tip: 'Noteer klachten een paar weken in je reflectie — dat helpt in het gesprek met je huisarts.',
  },
  {
    id: 'dieten', t: 'Diëten en toevoegingen', e: '🧪',
    intro: 'Er zijn veel claims over ADHD-diëten. Een korte stand van zaken.',
    claims: [
      ['aannemelijk', 'Bij een deel van de kinderen met ADHD namen klachten af met een streng eliminatiedieet. Zulke studies zijn moeilijk blind uit te voeren, en zo\'n dieet is zwaar: alleen met begeleiding van een diëtist.'],
      ['aannemelijk', 'Bepaalde kunstmatige kleurstoffen gaven in studies bij sommige kinderen een klein effect op hyperactiviteit.'],
      ['aannemelijk', 'Een gevarieerd voedingspatroon (zoals mediterraan of de Schijf van Vijf) hangt in observationeel onderzoek samen met minder ADHD-klachten. Of dat oorzaak of gevolg is, is onbekend.'],
    ],
    tip: 'Geen strenge regels nodig: kleine, haalbare gewoontes houden het langst stand.',
  },
];

/** Voedingsmiddelen die specifiek gevraagd zijn, met bewijsniveau voor ADHD. */
export const FOOD_CARDS = [
  { e: '🥣', t: 'Havermout', what: 'Vezels (bèta-glucaan), langzame koolhydraten, wat eiwit.', adhd: ['aannemelijk', 'Draagt bij aan een stabiele bloedsuiker en verzadiging; geen ADHD-specifiek effect bekend.'] },
  { e: '🍌', t: 'Groene banaan', what: 'Resistent zetmeel (prebioticum).', adhd: ['onvoldoende', 'Goed voor darmbacteriën; verband met ADHD niet onderzocht.'] },
  { e: '🥛', t: 'Kefir', what: 'Levende culturen (probiotica), eiwit, calcium.', adhd: ['onvoldoende', 'Kan darmdiversiteit ondersteunen; effect op ADHD onbekend.'] },
  { e: '🫐', t: 'Bessen', what: 'Vezels, vitamine C, polyfenolen.', adhd: ['onvoldoende', 'Gezond fruit; geen aangetoond effect op ADHD.'] },
  { e: '🍎', t: 'Granaatappel', what: 'Polyfenolen (antioxidanten).', adhd: ['onvoldoende', 'Weinig onderzoek bij mensen; geen conclusies voor ADHD.'] },
  { e: '🥚', t: 'Eieren', what: 'Volwaardig eiwit, choline, vitamine B12 en D.', adhd: ['aannemelijk', 'Maakt een eiwitrijk ontbijt makkelijk; direct ADHD-effect niet aangetoond.'] },
  { e: '🐟', t: 'Vette vis', what: 'EPA en DHA (omega 3), eiwit, vitamine D.', adhd: ['aannemelijk', 'Omega 3 laat in meta-analyses een klein effect zien, vooral bij kinderen.'] },
  { e: '🌰', t: 'Noten en zaden', what: 'Plantaardige omega 3 (walnoot, lijnzaad, chia), vezels, magnesium, zink.', adhd: ['onvoldoende', 'Waardevol als bron van mineralen; geen aangetoond ADHD-effect.'] },
  { e: '🥦', t: 'Groenten en fruit', what: 'Vezels, vitamines, mineralen, polyfenolen.', adhd: ['aannemelijk', 'Onderdeel van een gevarieerd patroon dat samenhangt met minder klachten (samenhang, geen bewijs van oorzaak).'] },
];

export const SOURCES = 'Gebaseerd op richtlijnen van het Voedingscentrum en de Gezondheidsraad, Thuisarts.nl en overzichtsstudies (meta-analyses) naar voeding en ADHD. Kennisstand: 2026. Onderzoek ontwikkelt zich; informatie kan veranderen.';
