import { dialogueRanges } from '../editor/dialogue';
import { type Issue, words } from './check';
import { CLICHES, FILLERS, FILLER_AFTER_GUARDS, FILLER_GUARDS, NOT_ECHOES, NOT_MANNER, NOT_PASSIVE, REDUNDANCIES, WORDY, listRegExp, shorterWay } from './styleLists';

/**
 * Style and readability: Hemingway-style highlights (adverbs, simpler words,
 * passive voice, grade level) and ProWritingAid-style ones
 * (crutch words, sticky sentences, echoes, clichés, redundancies). All are
 * suggestions, never mistakes, and are only shown while Spicy Sally is checking.
 */

export const STYLE_RULES: { id: string; label: string; why: string }[] = [
  { id: 'adverb', label: 'Adverbs', why: 'Adverbs often prop up a weak verb. “Ran quickly” is “dashed”. Keep the ones that earn their place.' },
  { id: 'simpler-word', label: 'Simpler words', why: 'A shorter, plainer word usually says the same thing with less effort for the reader.' },
  { id: 'passive', label: 'Passive voice', why: 'In the passive voice the doer of the action comes last or not at all. Saying who did what is usually livelier.' },
  { id: 'sticky-sentence', label: 'Sticky sentences', why: 'Most of this long sentence is glue words (the, of, to, it, that…), which carry little meaning. Cut some to tighten it.' },
  { id: 'crutch-word', label: 'Crutch words', why: 'Words like “just”, “really” and “suddenly” creep into every draft and rarely add anything. Speech is left alone, since that is how people talk.' },
  { id: 'echo', label: 'Echoes', why: 'The same word twice in quick succession can sound like an echo. Change one if it wasn’t on purpose.' },
  { id: 'cliche', label: 'Clichés', why: 'A phrase readers have seen many times slides past them. Something of your own will stick.' },
  { id: 'redundancy', label: 'Redundancies', why: 'Part of this phrase repeats the rest. The shorter version means the same.' },
  { id: 'OxfordComma', label: 'Oxford comma', why: 'A comma before the “and” that ends a list: “bread, butter, and jam”. Some house styles want it and some don’t, so this starts off.' },
  { id: 'own-pattern', label: 'Your own list', why: 'You put this on your own list in Recipe Settings › Seasonings.' },
];

const WHY = Object.fromEntries(STYLE_RULES.map((r) => [r.id, r.why]));

/** Short words that hold a sentence together but carry little meaning. */
export const GLUE = new Set(
  'a an the of to in on at by for from with into onto upon and or but nor so as if than that this these those it its is are was were be been being am do does did have has had i me my we us our you your he him his she her they them their there here what which who whom whose when where why how not no all any some can could would should will shall may might must just very then also too up out about over off'.split(' '),
);

/** Words ending in -ly that aren't adverbs, or that no writer would want flagged. */
export const NOT_ADVERBS = new Set(
  'only family early daily holy reply supply apply belly jelly ugly lonely friendly lovely likely unlikely silly curly hilly chilly bully rally ally fly july italy lily oily smelly wily jolly folly holly homely costly deadly elderly orderly lively lowly sly rely comply imply multiply anomaly assembly butterfly monopoly melancholy worldly cowardly scholarly ghastly ghostly heavenly beastly bubbly burly cuddly frilly gangly gnarly grisly measly prickly sickly surly wobbly wrinkly unruly unsightly leisurely motherly fatherly brotherly sisterly neighbourly neighborly manly womanly timely untimely weekly monthly yearly hourly nightly quarterly kindly lily-white reply'.split(' '),
);

const SIMPLER: Record<string, string> = {
  utilize: 'use', utilise: 'use', utilized: 'used', utilised: 'used', utilizes: 'uses', utilises: 'uses', utilization: 'use', commence: 'begin', commenced: 'began', approximately: 'about', assist: 'help', assistance: 'help',
  purchase: 'buy', purchased: 'bought', endeavor: 'try', endeavour: 'try', additional: 'more', numerous: 'many', sufficient: 'enough', facilitate: 'help',
  obtain: 'get', obtained: 'got', subsequently: 'later', demonstrate: 'show', demonstrated: 'showed', terminate: 'end', terminated: 'ended',
  individual: 'person', individuals: 'people', require: 'need', required: 'needed', regarding: 'about', inquire: 'ask', enquire: 'ask', inquired: 'asked',
  enquired: 'asked', attempt: 'try', attempted: 'tried', possess: 'have', possessed: 'had', reside: 'live', resided: 'lived', residence: 'home',
  observe: 'see', observed: 'saw', proceed: 'go', proceeded: 'went', retain: 'keep', retained: 'kept', sufficiently: 'enough', initial: 'first',
  initially: 'at first', frequently: 'often', nevertheless: 'still', consequently: 'so', therefore: 'so', accordingly: 'so', perceive: 'see',
  perceived: 'saw', converse: 'talk', conversed: 'talked', depart: 'leave', departed: 'left', inform: 'tell', informed: 'told', modify: 'change',
  modified: 'changed', indicate: 'show', indicated: 'showed', locate: 'find', permit: 'let', permitted: 'let', ascertain: 'find out',
  'in order to': 'to', 'prior to': 'before', 'a number of': 'some', 'at this point in time': 'now', 'due to the fact that': 'because',
  'in the event that': 'if', 'with regard to': 'about', 'in spite of the fact that': 'although', 'for the purpose of': 'to', 'at the present time': 'now',
  ...WORDY,
};

const IRREGULAR = new Set(
  'given taken written seen done made known shown thrown grown drawn broken chosen driven eaten fallen forgotten forgiven frozen hidden ridden risen shaken spoken stolen sworn torn worn woken beaten bitten built bought brought caught taught thought sought fought felt kept left lost meant met paid said sent sold told held found heard hit hurt cut put set shut spent struck stuck won led fed born borne begun sung rung drunk sunk swum laid hung slain sewn sown shorn spun flung stung swung wrung'.split(' '),
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches any of the phrases, with a straight or curly apostrophe. */
const phrases = (list: string[]) =>
  new RegExp(`(?<![\\p{L}'’])(?:${[...list].sort((a, b) => b.length - a.length).map((p) => escape(p).replace(/['’]/g, "['’]")).join('|')})(?![\\p{L}'’])`, 'giu');
/** How a matched phrase is looked up in a list: lower case, curly apostrophes. */
const keyOf = (s: string) => s.toLowerCase().replace(/'/g, '’');
const SIMPLER_RE = phrases(Object.keys(SIMPLER));
const CRUTCH_RE = phrases(FILLERS);
const FILLER_WORDS = new Set(FILLERS);
const REDUNDANT_RE = listRegExp(REDUNDANCIES.map(([pattern]) => pattern));
const CLICHE_RE = listRegExp(CLICHES);
const PASSIVE_RE = /(?<![\p{L}])(?:am|is|are|was|were|be|been|being)\s+(?:\p{L}+ly\s+)?(\p{L}+)(?![\p{L}'’])/giu;

/** Keeps a replacement's capital when the original started with one. */
const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);

export interface Sentence {
  from: number;
  to: number;
  words: number;
  letters: number;
}

/** A paragraph's sentences, ending at . ! ? or … with any closing quotes. */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?…]*(?:[.!?…]+[”"’)\]]*|$)/gu;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const body = m[0].trim();
    if (!/\p{L}/u.test(body)) continue;
    const ws = words(body);
    out.push({ from: m.index + lead, to: m.index + lead + body.length, words: ws.length, letters: (body.match(/[\p{L}\p{N}]/gu) ?? []).length });
  }
  return out;
}

/** The Automated Readability Index, as Hemingway uses: the school grade needed to read the text easily. */
export function gradeLevel(letters: number, wordCount: number, sentenceCount: number): number {
  if (wordCount === 0 || sentenceCount === 0) return 0;
  return Math.max(0, 4.71 * (letters / wordCount) + 0.5 * (wordCount / sentenceCount) - 21.43);
}

/** The grade level of a whole scene, from its paragraphs. */
export function textGrade(paragraphs: string[]): { grade: number; words: number; sentences: number } {
  let letters = 0;
  let count = 0;
  let total = 0;
  for (const p of paragraphs) {
    for (const s of sentences(p)) {
      letters += s.letters;
      count += s.words;
      total++;
    }
  }
  return readingGrade({ letters, words: count, sentences: total });
}

/** The grade level from letter, word and sentence counts, as textGrade gives it. */
export function readingGrade({ letters, words: count, sentences: total }: { letters: number; words: number; sentences: number }): { grade: number; words: number; sentences: number } {
  return { grade: count > 0 ? Math.max(1, Math.round(gradeLevel(letters, count, total))) : 0, words: count, sentences: total };
}

/** How many words apart the same word still sounds like an echo. */
const ECHO_WINDOW = 10;
/** A sentence is sticky when it is this long and this much of it is glue. Shorter ones read fine whatever they're made of. */
const STICKY_WORDS = 20;
const STICKY_GLUE = 0.6;
/** “Again and again”, “day after day”, “very, very”: a word repeated on purpose. */
const ON_PURPOSE = /^[\s,;:—–-]*(?:(?:and|or|after|by|upon|to|for|on)\s+)?$/iu;

function issue(from: number, to: number, rule: string, message: string, suggestions: string[] = []): Issue {
  return { from, to, kind: 'style', rule, message, suggestions, why: WHY[rule] };
}

/** Style issues in one paragraph. Story names are never counted as echoes or adverbs. */
export function styleIssues(text: string, names: string[] = []): Issue[] {
  const speech = dialogueRanges(text);
  const inSpeech = (from: number) => speech.some(([a, b]) => from >= a && from < b);
  const nameWords = new Set(names.flatMap((n) => n.toLowerCase().split(/\s+/)));
  const out: Issue[] = [];

  for (const s of sentences(text)) {
    if (s.words >= STICKY_WORDS) {
      const ws = words(text.slice(s.from, s.to));
      const glue = ws.filter((w) => GLUE.has(w.word.toLowerCase().replace(/’/g, "'"))).length;
      if (glue / ws.length >= STICKY_GLUE) out.push(issue(s.from, s.to, 'sticky-sentence', `This sentence is sticky: ${Math.round((glue / ws.length) * 100)}% glue words.`));
    }
  }

  const tokens = words(text);
  for (const w of tokens) {
    const lower = w.word.toLowerCase();
    if (lower.length > 4 && lower.endsWith('ly') && !NOT_ADVERBS.has(lower) && (!NOT_MANNER.has(lower) || FILLER_WORDS.has(lower)) && !nameWords.has(lower) && !inSpeech(w.from)) {
      out.push(issue(w.from, w.to, 'adverb', `“${w.word}” is an adverb. Could a stronger verb do the work?`));
    }
  }

  for (const m of text.matchAll(SIMPLER_RE)) {
    const plain = SIMPLER[keyOf(m[0])]!;
    out.push(issue(m.index, m.index + m[0].length, 'simpler-word', `“${plain}” is simpler than “${m[0]}”.`, [matchCase(m[0], plain)]));
  }
  for (const m of text.matchAll(PASSIVE_RE)) {
    const verb = m[1]!.toLowerCase();
    if (NOT_PASSIVE.has(verb) || !(/ed$/.test(verb) || IRREGULAR.has(verb))) continue;
    if (/ly$/.test(verb)) continue;
    out.push(issue(m.index, m.index + m[0].length, 'passive', 'Passive voice. Who is doing this?'));
  }
  for (const m of text.matchAll(CRUTCH_RE)) {
    if (inSpeech(m.index)) continue;
    const lower = keyOf(m[0]);
    if (FILLER_GUARDS[lower]?.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    if (FILLER_AFTER_GUARDS[lower]?.test(text.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
    out.push(issue(m.index, m.index + m[0].length, 'crutch-word', `“${m[0]}” is a crutch word. Does the sentence need it?`));
  }
  for (const m of text.matchAll(REDUNDANT_RE)) {
    const short = shorterWay(m[0]);
    if (short === undefined) continue;
    out.push(issue(m.index, m.index + m[0].length, 'redundancy', `“${m[0]}” says it twice. “${short}” is enough.`, [matchCase(m[0], short)]));
  }
  for (const m of text.matchAll(CLICHE_RE)) out.push(issue(m.index, m.index + m[0].length, 'cliche', `“${m[0]}” is a cliché.`));
  const open = unclosedQuote(text);
  if (open) out.push(open);
  out.push(...strayCapitals(text, names));

  // Echoes: the same telling word again within a few words. Names, glue and
  // short words don't count, and nor does a word that starts a sentence in capitals.
  const seen = new Map<string, number>();
  tokens.forEach((w, i) => {
    const lower = w.word.toLowerCase().replace(/’/g, "'");
    if (lower.length < 5 || GLUE.has(lower) || nameWords.has(lower) || FILLER_WORDS.has(lower) || NOT_ECHOES.has(lower)) return;
    if (/^\p{Lu}/u.test(w.word) && i > 0 && !/[.!?…]["”’]?\s*$/u.test(text.slice(tokens[i - 1]!.to, w.from))) return;
    const stem = lower.replace(/(?:'s|s)$/, '');
    const last = seen.get(stem);
    if (last !== undefined && i - last <= ECHO_WINDOW && !ON_PURPOSE.test(text.slice(tokens[last]!.to, w.from))) out.push(issue(w.from, w.to, 'echo', `“${w.word}” echoes the same word just before it.`));
    seen.set(stem, i);
  });

  // One issue per stretch of text: the more specific rules win over adverbs and crutch words.
  const order = ['redundancy', 'cliche', 'simpler-word', 'passive', 'crutch-word', 'adverb', 'echo'];
  const sentenceRules = new Set(['sticky-sentence']);
  const kept: Issue[] = [];
  for (const i of [...out].sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule))) {
    if (!sentenceRules.has(i.rule) && kept.some((k) => !sentenceRules.has(k.rule) && i.from < k.to && i.to > k.from)) continue;
    kept.push(i);
  }
  return kept.sort((a, b) => a.from - b.from || b.to - a.to);
}

/**
 * Speech that opens with a curly quote and never closes. The fix closes it
 * after the paragraph's last word. A straight quote is left alone, since it
 * may be an inch mark or a typo of its own.
 */
export function unclosedQuote(text: string): Issue | null {
  const last = text.lastIndexOf('“');
  if (last === -1 || text.indexOf('”', last) !== -1) return null;
  const end = text.trimEnd().length;
  const word = /\S+$/u.exec(text.slice(last, end));
  if (!word || end <= last + 1) return null;
  const from = last + word.index;
  return { from, to: end, kind: 'grammar', rule: 'unclosed-quote', message: 'This quote is never closed.', suggestions: [`${text.slice(from, end)}”`] };
}

/**
 * Capitals in the wrong place, as when Shift is held a moment too long
 * (“MOnster”, “THe”) or Caps Lock is on (“mONSTER”). Acronyms with a plural
 * (“DVDs”), degrees (“MSc”), short ones like “iOS” and the story's names are left alone.
 */
export function strayCapitals(text: string, names: string[] = []): Issue[] {
  const known = new Set(names.flatMap((n) => n.split(/\s+/)));
  const out: Issue[] = [];
  for (const w of words(text)) {
    if (known.has(w.word) || w.word.includes('-')) continue;
    // One trailing small letter is usually a plural or a degree (“DVDs”, “MSc”); a vowel there is a word (“THe”).
    const held = /^\p{Lu}{2,}(?:\p{Ll}{2,}|[aeiouy])$/u.test(w.word);
    const locked = /^\p{Ll}\p{Lu}{3,}$/u.test(w.word);
    if (!held && !locked) continue;
    // Held Shift meant one capital; Caps Lock turned every letter over.
    const fix = held ? w.word[0]! + w.word.slice(1).toLowerCase() : [...w.word].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
    out.push({ from: w.from, to: w.to, kind: 'grammar', rule: 'stray-capitals', message: `“${w.word}” has capitals in the wrong place.`, suggestions: [fix] });
  }
  return out;
}

export const isSentenceRule = (rule: string) => rule === 'sticky-sentence';
