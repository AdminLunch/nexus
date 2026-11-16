// Open Kompas — lichte, lokale herkenning van onderwerp en bedoeling.
// Bewust simpel en transparant (trefwoorden). Dit stelt NOOIT iets vast over de persoon;
// het helpt alleen om aan te sluiten op wat iemand nu zegt.

import { norm } from './util.js';

/**
 * Domeinen. `psych: true` betekent dat een psychologische invalshoek hier passend KAN zijn.
 * Bij de andere domeinen interpreteert NEXUS niet psychologisch, tenzij de gebruiker daar zelf om vraagt.
 */
export const DOMAINS = Object.freeze({
  practical: { label: 'praktisch', psych: false },
  work: { label: 'werk en studie', psych: false },
  interest: { label: 'interesses en hobby’s', psych: false },
  play: { label: 'plezier en ontspanning', psych: false },
  health: { label: 'gezondheid en lichaam', psych: false },
  relations: { label: 'mensen om je heen', psych: true },
  feeling: { label: 'hoe het met je gaat', psych: true },
  meaning: { label: 'wat je belangrijk vindt', psych: true },
  open: { label: 'vrij', psych: false },
});

const TOPICS = [
  { id: 'werk', domain: 'work', words: ['werk', 'baan', 'collega', 'baas', 'leidinggevende', 'kantoor', 'vergadering', 'deadline', 'klant', 'rooster', 'sollicit', 'studie', 'tentamen', 'school', 'opleiding', 'project'] },
  { id: 'geld', domain: 'practical', words: ['geld', 'budget', 'schuld', 'rekening', 'belasting', 'sparen', 'huur', 'hypotheek', 'verzekering'] },
  { id: 'wonen', domain: 'practical', words: ['verhuiz', 'huis', 'woning', 'opruimen', 'huishouden', 'klus', 'tuin'] },
  { id: 'planning', domain: 'practical', words: ['planning', 'agenda', 'tijd', 'uitstel', 'to do', 'todo', 'lijstje', 'overzicht', 'organiseren', 'afspraak'] },
  { id: 'slaap', domain: 'health', words: ['slaap', 'moe', 'vermoeid', 'wakker', 'nachtrust', 'insomnia'] },
  { id: 'beweging', domain: 'health', words: ['sport', 'trainen', 'hardlop', 'fitness', 'wandel', 'fietsen', 'zwemmen', 'yoga', 'beweg'] },
  { id: 'eten', domain: 'health', words: ['eten', 'koken', 'voeding', 'dieet', 'recept', 'afvallen', 'maaltijd'] },
  { id: 'relaties', domain: 'relations', words: ['vriend', 'vriendin', 'partner', 'relatie', 'familie', 'ouders', 'moeder', 'vader', 'kinderen', 'zoon', 'dochter', 'broer', 'zus', 'ruzie', 'eenzaam', 'date', 'daten'] },
  { id: 'gevoel', domain: 'feeling', words: ['stress', 'onrust', 'piekeren', 'pieker', 'somber', 'verdrietig', 'boos', 'bang', 'angst', 'zenuw', 'overprikkel', 'leeg', 'onzeker', 'gelukkig', 'blij', 'trots', 'gefrustreerd', 'gevoel', 'voel'] },
  { id: 'zingeving', domain: 'meaning', words: ['zin', 'richting', 'waarden', 'belangrijk vind', 'betekenis', 'wie ik ben', 'wat wil ik', 'keuze', 'twijfel'] },
  { id: 'creatief', domain: 'interest', words: ['muziek', 'gitaar', 'piano', 'tekenen', 'schilder', 'schrijven', 'fotograf', 'creatief', 'maken', 'bouwen', 'knutsel'] },
  { id: 'leren', domain: 'interest', words: ['leren', 'cursus', 'boek', 'lezen', 'podcast', 'taal', 'nieuwsgierig', 'interessant', 'uitzoeken', 'programmeren', 'geschiedenis', 'wetenschap'] },
  { id: 'natuur', domain: 'interest', words: ['natuur', 'vogels', 'bos', 'planten', 'tuinieren', 'sterren', 'dieren', 'hond', 'kat'] },
  { id: 'ontspanning', domain: 'play', words: ['spel', 'game', 'gamen', 'film', 'serie', 'vakantie', 'reizen', 'uitje', 'festival', 'concert', 'lol', 'plezier', 'grappig', 'chill', 'weekend'] },
];

const INTENTS = [
  // Volgorde = prioriteit.
  { id: 'safety', patterns: [/\b(zelfmoord\w*|suicid\w*|eind(e)? aan (mijn|m n) leven|niet meer (willen )?leven|mezelf (iets )?(aan ?doen|pijn doen)|dood (willen|wil)|wil dood)\b/] },
  { id: 'disagree', patterns: [/\b(klopt (helemaal |echt |gewoon )?niet|nee (dat|zo) (is|zit) (het )?niet|dat herken ik (me |mezelf )?niet|je zit ernaast|(dat|het) is (helemaal )?niet waar)\b/, /^(nee )?dat is (het )?niet( zo)?$/] },
  { id: 'skip', patterns: [/^(sla (dit |deze vraag )?over|overslaan|volgende|pas|liever niet|wil ik niet (op )?(in ?gaan|beantwoorden)|geen zin in deze vraag)\b/] },
  { id: 'switch', patterns: [/\b(iets (heel )?anders|ander onderwerp|over iets anders|genoeg hierover|laten we het over .+ hebben)\b/] },
  { id: 'practical', patterns: [/\b(hoe (kan|moet|regel|doe|pak) ik|tips?|oplossing|praktisch|concreet|stappenplan|wat moet ik doen|help me (met|bij)|regelen)\b/] },
  { id: 'tools', patterns: [/\b(oefening|opdracht|techniek|journal\w*|dagboek|schrijfopdracht|act|cgt|mindful\w*)\b/] },
  { id: 'unsure', patterns: [/\b(weet (ik )?(eigenlijk |echt |nog |ook )?(het )?(nog )?niet|geen (flauw )?idee|nog geen idee|geen flauw benul)\b/] },
  { id: 'goals', patterns: [/\b(doel|doelen|ambitie|wat wil ik bereiken|plannen maken)\b/] },
  { id: 'fun', patterns: [/\b(verveel|verveling|iets leuks|zin in iets|grappig|lol)\b/] },
];

/**
 * Kies het domein van een uitspraak. Een psychologisch domein telt alleen als de gebruiker
 * zelf gevoels- of betekeniswoorden gebruikt; anders volgen we het praktische onderwerp.
 */
export function primaryDomain(topics) {
  const psych = topics.find((t) => DOMAINS[t.domain]?.psych);
  return (psych || topics[0])?.domain || null;
}

/** Herken onderwerpen in een tekst. Geeft [{id, domain}] terug, hoogstens drie. */
export function detectTopics(text) {
  const t = ` ${norm(text)} `;
  const hits = [];
  for (const topic of TOPICS) {
    const score = topic.words.reduce((n, w) => n + (t.includes(` ${w}`) ? 1 : 0), 0);
    if (score) hits.push({ id: topic.id, domain: topic.domain, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 3).map(({ id, domain }) => ({ id, domain }));
}

/** Herken wat de gebruiker op dit moment wil (stuurt de gespreksbeweging, niet de persoon). */
export function detectIntent(text) {
  const t = norm(text);
  for (const intent of INTENTS) if (intent.patterns.some((p) => p.test(t))) return intent.id;
  return String(text || '').trim().endsWith('?') || /^(hoe|wat|waarom|wanneer|kan|is|zijn)\b/.test(t) ? 'question' : 'share';
}

export const topicDomain = (topicId) => TOPICS.find((t) => t.id === topicId)?.domain || 'open';
export const isPsychDomain = (domain) => !!DOMAINS[domain]?.psych;

/**
 * Herken uitspraken die de gebruiker mogelijk wil bewaren — als VOORSTEL.
 * Er wordt niets opgeslagen zonder dat de gebruiker op "Onthouden" drukt.
 */
export function detectSaveCandidates(text) {
  const raw = String(text || '').trim();
  const out = [];
  const value = raw.match(/(?:ik vind|voor mij is|mij is)\s+(.{3,80}?)\s+(?:echt |heel |erg )?(?:belangrijk|waardevol|essentieel)/i)
    || raw.match(/(?:belangrijk voor mij is|wat ik belangrijk vind is)\s+(.{3,80})/i);
  if (value) out.push({ type: 'value', text: tidy(value[1]) });
  const interest = raw.match(/(?:ik (?:vind|vond) het (?:leuk|interessant|gaaf|mooi) om|ik ben (?:nieuwsgierig naar|geïnteresseerd in)|ik zou graag (?:meer )?(?:willen )?leren)\s+(.{3,80})/i);
  if (interest) out.push({ type: 'interest', text: tidy(interest[1]) });
  return out;
}

function tidy(s) {
  return s.replace(/[.!?,;]+$/, '').replace(/\s+/g, ' ').trim();
}

/** Kort citaat uit de woorden van de gebruiker, om vervolgvragen aan te laten sluiten. */
export function echoPhrase(text, maxWords = 7) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (!clean) return '';
  const clauses = clean.split(/[,;:]|\s(?:maar|want|omdat|en dan|terwijl)\s/i).map((c) => c.trim()).filter((c) => c.split(' ').length >= 2);
  const best = (clauses.length ? clauses[clauses.length - 1] : clean).split(' ');
  const words = best.length > maxWords ? best.slice(-maxWords) : best;
  return words.join(' ').replace(/^(ik |dat |en |dus |me |mij )+/i, '');
}
