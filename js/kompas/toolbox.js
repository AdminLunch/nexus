// Open Kompas — optionele hulpmiddelen (ACT, CGT, journaling).
// Dit zijn uitnodigingen, geen behandelroutes. Ze worden alleen aangeboden als de gebruiker
// erom vraagt, of hoogstens één keer per sessie bij een passend onderwerp. Elke oefening
// kan op elk moment gestopt worden en niets wordt bewaard tenzij de gebruiker dat kiest.

export const TOOLS = Object.freeze([
  {
    id: 'journal-free',
    approach: 'journaling',
    name: 'Vrij schrijven',
    when: ['feeling', 'meaning', 'relations', 'open'],
    intro: 'Vijf minuten opschrijven wat er in je opkomt, zonder dat het ergens heen hoeft.',
    steps: ['Zet een timer op 5 minuten.', 'Schrijf alles op wat er nu door je hoofd gaat — ook onzin of halve zinnen.', 'Lees het eventueel terug. Valt je iets op? Dat hoeft niet.'],
  },
  {
    id: 'journal-curious',
    approach: 'journaling',
    name: 'Nieuwsgierigheidsnotitie',
    when: ['interest', 'play', 'open', 'meaning'],
    intro: 'Een korte notitie over iets wat je recent interessant, grappig of mooi vond.',
    steps: ['Wat trok deze week je aandacht?', 'Wat maakte het interessant?', 'Wil je er meer over weten — of was het gewoon leuk? Allebei prima.'],
  },
  {
    id: 'act-values',
    approach: 'ACT',
    name: 'Wat vind ik hierin belangrijk?',
    when: ['meaning', 'work', 'relations'],
    intro: 'Een lichte verkenning van wat je in een situatie belangrijk vindt — zonder er een doel van te maken.',
    steps: ['Denk aan de situatie waar je het over had.', 'Welke manier van omgaan ermee zou je achteraf goed vinden?', 'Is daar een klein ding bij dat je zou willen proberen? Mag ook "nee".'],
  },
  {
    id: 'act-defusion',
    approach: 'ACT',
    name: 'Afstand nemen van een gedachte',
    when: ['feeling'],
    intro: 'Een gedachte bekijken als gedachte, in plaats van als waarheid.',
    steps: ['Schrijf een gedachte op die blijft terugkomen.', 'Zet ervoor: "Ik merk dat ik de gedachte heb dat…".', 'Merk je verschil? Zo niet, ook goed — het is maar een proef.'],
  },
  {
    id: 'cbt-check',
    approach: 'CGT',
    name: 'Gedachte-check',
    when: ['feeling', 'work', 'relations'],
    intro: 'Een situatie, je eerste gedachte en een paar andere mogelijke manieren om ernaar te kijken.',
    steps: ['Wat gebeurde er (alleen de feiten)?', 'Wat was je eerste gedachte?', 'Welke twee andere verklaringen zijn er ook mogelijk?', 'Hoe kijk je er nu naar? Er is geen goed antwoord.'],
  },
  {
    id: 'practical-next',
    approach: 'praktisch',
    name: 'Kleinste volgende stap',
    when: ['practical', 'work', 'health', 'open'],
    intro: 'Een groot ding terugbrengen tot één kleine, concrete stap.',
    steps: ['Wat wil je geregeld hebben?', 'Wat is het allerkleinste stukje dat je vandaag of morgen kunt doen?', 'Wanneer en waar doe je dat?'],
  },
]);

/** Suggesties voor een domein (hoogstens `limit`), met verschillende benaderingen. */
export function suggestTools(domain, { limit = 2, exclude = [] } = {}) {
  const picked = [];
  const seenApproach = new Set();
  for (const t of TOOLS) {
    if (exclude.includes(t.id) || !t.when.includes(domain) || seenApproach.has(t.approach)) continue;
    picked.push(t);
    seenApproach.add(t.approach);
    if (picked.length >= limit) break;
  }
  if (!picked.length) picked.push(TOOLS[0]);
  return picked;
}

export const getTool = (id) => TOOLS.find((t) => t.id === id) || null;
