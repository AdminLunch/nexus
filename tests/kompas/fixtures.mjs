// Uitsluitend SYNTHETISCHE testgegevens. Geen echte personen of echte gesprekken.
export const T0 = '2026-01-10T09:00:00.000Z';
export const day = (n) => new Date(Date.parse(T0) + n * 86400000).toISOString();

export function seqIds() {
  let i = 0;
  return (prefix = 'k') => `${prefix}-${++i}`;
}

/** Fictieve persoon "Sam" — verzonnen uitspraken voor tests en het prototype. */
export const SYNTHETIC_SAM = {
  told: [
    { text: 'Ik werk sinds kort in ploegendienst', topics: ['werk'] },
    { text: 'Ik woon samen met twee katten', topics: ['natuur'] },
  ],
  values: [{ text: 'Eerlijkheid', topics: [] }],
  interests: [{ text: 'Vogels tekenen', topics: ['creatief', 'natuur'] }],
  possible: [{ text: 'Misschien hangen slecht slapen en de late diensten samen', topics: ['slaap', 'werk'], alternatives: ['Het kan ook aan de buren liggen.'] }],
};

/** Gevarieerd synthetisch gespreksscript: werk, gevoel, hobby, praktisch, plezier. */
export const SCRIPT = [
  'Ik wil NEXUS gebruiken om wat meer overzicht te krijgen',
  'Op mijn werk is het druk sinds het nieuwe rooster',
  'Mijn collega en ik botsen soms over de planning',
  'Ik voel me daar soms onrustig door',
  { type: 'action', id: 'angle' },
  'Weet ik eigenlijk niet',
  { type: 'action', id: 'switch' },
  'Ik ben laatst begonnen met gitaar spelen',
  { type: 'action', id: 'deeper' },
  'Vooral oude rocknummers, gewoon voor de lol',
  'Hoe kan ik mijn verhuizing regelen zonder gedoe',
  'Ik heb al dozen gekocht',
  'Een lijstje maken van wat mee moet',
  'Zaterdag',
  'Ik vind rust in huis heel belangrijk',
  { type: 'action', id: 'skip' },
  'Ik heb zin in een film vanavond',
  'Hebben jullie tips voor een goede serie?',
];
