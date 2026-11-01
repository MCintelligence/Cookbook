import { type Dialect } from './check';

/**
 * The Englishes a writer can pick. Each has the word list Salty Sam spells
 * with and the dialect Peppery Pete's grammar follows; those without a list
 * of their own borrow the nearest one.
 */
export type English = 'en-US' | 'en-GB' | 'en-CA' | 'en-AU' | 'en-NZ' | 'en-IE' | 'en-IN' | 'en-ZA';

export const ENGLISHES: { id: English; name: string; sample: string; dialect: Dialect }[] = [
  { id: 'en-US', name: 'American', sample: 'color, center, realize', dialect: 'en-US' },
  { id: 'en-GB', name: 'British', sample: 'colour, centre, realise', dialect: 'en-GB' },
  { id: 'en-CA', name: 'Canadian', sample: 'colour, centre, realize', dialect: 'en-CA' },
  { id: 'en-AU', name: 'Australian', sample: 'colour, centre, realise', dialect: 'en-AU' },
  { id: 'en-NZ', name: 'New Zealand', sample: 'colour, centre, realise', dialect: 'en-AU' },
  { id: 'en-IE', name: 'Irish', sample: 'colour, centre, realise', dialect: 'en-GB' },
  { id: 'en-IN', name: 'Indian', sample: 'colour, centre, realise', dialect: 'en-GB' },
  { id: 'en-ZA', name: 'South African', sample: 'colour, centre, realise', dialect: 'en-GB' },
];

/** The spellings the proofreader has word lists for, in the order a recipe's settings list them. */
export const DIALECTS: { id: Dialect; name: string }[] = [
  { id: 'en-US', name: 'American' },
  { id: 'en-GB', name: 'British' },
  { id: 'en-CA', name: 'Canadian' },
  { id: 'en-AU', name: 'Australian' },
];

export const isEnglish = (v: unknown): v is English => ENGLISHES.some((e) => e.id === v);
export const isDialect = (v: unknown): v is Dialect => DIALECTS.some((d) => d.id === v);

export function dialectOf(english: English): Dialect {
  return ENGLISHES.find((e) => e.id === english)?.dialect ?? 'en-US';
}

/** The English the system is set to, if it is one Cookbook knows; American otherwise. */
export function systemEnglish(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): English {
  for (const lang of languages) {
    if (!/^en\b/i.test(lang)) continue;
    const region = /^en-([a-z]{2})\b/i.exec(lang)?.[1]?.toUpperCase();
    const id = `en-${region}`;
    if (region && isEnglish(id)) return id;
    if (region === 'UK') return 'en-GB';
    return 'en-US';
  }
  return 'en-US';
}
