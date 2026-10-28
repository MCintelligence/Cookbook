import { dialogueRanges } from '../editor/dialogue';
import { type Issue, words } from './check';
import { type Counts } from './context';

/**
 * Peppery Pete's own grammar checks, for the mistakes Harper misses. They
 * work by rules, as a reader does: find the clause's subject, skipping the
 * "of the onions" and "along with the notes" that sit between it and its
 * verb, see whether it is one thing or many, and check the verb agrees. The
 * word-pair counts Sam uses (context.ts) stand guard, so a pair the books
 * use far more often than its fix ("the news was") is left alone.
 *
 * Speech is left alone, since "they was" is how some people talk.
 */

export const PETE_RULES: { id: string; label: string }[] = [
  { id: 'agreement', label: 'Subject and verb agreement' },
  { id: 'word-mixup', label: 'Mixed-up words (your/you’re, less/fewer…)' },
  { id: 'pronoun-case', label: 'I or me, he or him' },
  { id: 'verb-form', label: 'Wrong verb forms (I seen, she lay the book)' },
  { id: 'reported-question', label: 'Questions inside a sentence' },
];

/** Something that says whether a word is in the dictionary. */
export type IsWord = (word: string) => boolean;

interface Token {
  word: string;
  lower: string;
  from: number;
  to: number;
  /** The first word of its clause: after a sentence end, a dash, a bracket, a quote or a semicolon. */
  start: boolean;
  /** What comes before it, back to the previous word. */
  gap: string;
}

const CLAUSE_BREAK = /[.!?…;:()[\]{}"“”—–]/u;

const SINGULAR_BE: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't", "doesn't": "don't" };
const PLURAL_BE: Record<string, string> = Object.fromEntries(Object.entries(SINGULAR_BE).map(([s, p]) => [p, s]));

/** Plurals that don't end in s. */
const IRREGULAR_PLURALS = new Set('children people men women feet teeth mice geese oxen policemen firemen fishermen gentlemen'.split(' '));
/** Words that end in s but are one thing, or can't be told apart. */
const S_SINGULARS = new Set(
  'news series species means physics mathematics politics economics measles lens bus gas yes this his its always perhaps sometimes besides less unless thus chaos atlas canvas bias iris cactus christmas mumps billiards athletics ethics gymnastics headquarters kudos pants scissors trousers glasses clothes'.split(
    ' ',
  ),
);
/** Groups that British English treats as many and American as one, so neither is wrong. */
const COLLECTIVE = new Set('team family crew staff police government couple group majority minority audience committee jury class band crowd company army navy council public faculty board'.split(' '));

const SINGULAR_DET = new Set(['a', 'an', 'this', 'that', 'each', 'every', 'another', 'one']);
const PLURAL_DET = new Set(['these', 'those', 'many', 'several', 'few', 'both', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'hundred', 'dozen']);
const OPEN_DET = new Set(['the', 'my', 'his', 'her', 'its', 'our', 'your', 'their', 'no']);
/** Phrases that start a subject but leave its number to a noun further on, so we don't guess. */
const LEAVE = new Set(['some', 'any', 'all', 'most', 'none', 'half', 'lots', 'plenty', 'more', 'such', 'what', 'which', 'whose']);

const PREPOSITIONS = new Set(
  'of in on at with from for by near behind beside under over without inside outside above below between among around across through into onto beneath toward towards about like against along past within upon'.split(' '),
);
/** Words that join on to a subject without adding to it, set off by commas: "The recipe, along with the notes, was lost". */
const ALONG = [['along', 'with'], ['together', 'with'], ['as', 'well', 'as'], ['including'], ['like'], ['with'], ['in', 'addition', 'to']];

/** Words that can't sit inside a simple subject, so a run with one in it isn't a subject we understand. */
const NOT_IN_SUBJECT = new Set(
  'i you he she it we they me him us them who whom whose which that what where when why how and or but nor so if then than because while although though since until unless as not never is are was were be been being am has have had do does did will would shall should can could may might must to'.split(
    ' ',
  ),
);

const SUBJUNCTIVE = new Set(['if', 'though', 'wish', 'wished', 'wishes', 'suppose', 'imagine', 'pretend', 'pretended', 'unless']);
const AUXILIARIES = new Set("do does did don't doesn't didn't will would shall should can could may might must let make made to 'd won't wouldn't can't couldn't shouldn't mustn't".split(' '));

const NUMBER_WORDS = new Set(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'dozens', 'hundreds', 'thousands', 'many', 'several', 'lots']);

/** Words a verb is often followed by, and a plural noun rarely is. */
const AFTER_VERB = new Set(
  'the a an to into onto across over up down away home out in on at from with his her their my its our your them him me us it this that back off around through along past fast slowly quickly toward towards behind'.split(' '),
);

/** -ing words that are nouns, so "your wedding to him" stays. */
const ING_NOUNS = new Set(
  'wedding building meeting feeling morning evening ceiling painting writing cooking ring king thing string darling sibling beginning ending offering clothing bedding pudding stuffing filling frosting icing dumpling earring wing spring sling swing calling training upbringing warning greeting saying being engagement'.split(
    ' ',
  ),
);

const OBJECTS_OF_LOSE = new Set(
  'the my your his her our their its it him them me us weight track sight control touch hope time face heart count interest money everything anything nothing this that'.split(' '),
);
const BEFORE_LOSE = new Set("to will would could might can cannot can't won't didn't don't doesn't never not gonna must should shall may".split(' '));

const SUBJECT_OF: Record<string, string> = { me: 'I', him: 'he', her: 'she', them: 'they', us: 'we' };
const CASE_PREPOSITIONS = new Set(['between', 'for', 'to', 'with', 'from', 'like', 'about', 'than', 'at', 'behind', 'beside', 'among', 'against', 'towards', 'toward']);

const SEEN_SUBJECTS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);
const QUESTION_WORDS = new Set(['where', 'when', 'why', 'how', 'what', 'who', 'whether', 'if']);
const ASKING = new Set(['asked', 'asks', 'ask', 'wondered', 'wonders', 'wonder']);
const SWAPPABLE_AUX = new Set(['are', 'is', 'was', 'were', 'am', 'will', 'would', 'can', 'could', 'should', 'shall', 'might', 'may', 'must', 'have', 'has', 'had']);
const DO_AUX = new Set(['did', 'do', 'does']);
const PRONOUNS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they']);

const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);

function tokens(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const w of words(text)) {
    const gap = text.slice(last, w.from);
    // Curly and straight apostrophes are the same to every rule here.
    const lower = w.word.toLowerCase().replace(/’/g, "'");
    out.push({ word: w.word, lower, from: w.from, to: w.to, start: out.length === 0 || CLAUSE_BREAK.test(gap), gap });
    last = w.to;
  }
  return out;
}

/** The pair counts of the books and the writer's own book together. */
function pairCount(counts: Counts[], a: string, b: string): number {
  return counts.reduce((n, c) => n + (c.pairs.get(`${a} ${b}`) ?? 0), 0);
}

/** One thing or many, or null when the word alone can't say. */
function nounNumber(lower: string, isWord: IsWord): 'one' | 'many' | null {
  if (COLLECTIVE.has(lower) || NOT_IN_SUBJECT.has(lower)) return null;
  if (IRREGULAR_PLURALS.has(lower)) return 'many';
  if (S_SINGULARS.has(lower)) return null;
  if (/s$/.test(lower) && !/(?:ss|us|is|'s)$/.test(lower)) {
    const stems = [lower.slice(0, -1), lower.replace(/es$/, ''), lower.replace(/ies$/, 'y')];
    return stems.some((s) => s !== lower && s.length > 1 && isWord(s)) ? 'many' : null;
  }
  if (/s$/.test(lower)) return null;
  return isWord(lower) ? 'one' : null;
}

interface Subject {
  /** The word that decides the number. */
  head: Token;
  number: 'one' | 'many';
  /** Index of the token after the subject, where the verb should be. */
  next: number;
  /** Whether the head sits right before the verb, so the word pairs can be asked about. */
  adjacent: boolean;
  /** The words after the determiner, which may run on into a verb that isn't "is" or "has": "the dogs runs". */
  phrase?: [number, number];
}

/** Where a simple noun phrase starting at i ends: up to `limit` describing words and a noun, before any break, comma, little word or preposition. */
function phraseEnd(ts: Token[], i: number, limit: number): number {
  let j = i;
  while (j < ts.length && j - i < limit) {
    const t = ts[j]!;
    if (j > i && (t.start || /,/.test(t.gap))) break;
    if (NOT_IN_SUBJECT.has(t.lower) || PREPOSITIONS.has(t.lower) || OPEN_DET.has(t.lower) || SINGULAR_DET.has(t.lower)) break;
    j++;
  }
  return j;
}

/**
 * The subject starting at token i, when it is a shape the rules understand:
 * a determiner, a few describing words and a noun, with "of the …" or
 * ", along with …," after it; "each of …", "one of …"; or "neither … nor …".
 */
function subjectAt(ts: Token[], i: number, isWord: IsWord): Subject | null {
  const t = ts[i];
  if (!t) return null;
  if (LEAVE.has(t.lower)) return null;
  // "Each of the cooks", "One of them", "Neither of us": one.
  if (['each', 'one', 'neither', 'either', 'every'].includes(t.lower) && ts[i + 1]?.lower === 'of') {
    let j = i + 2;
    if (OPEN_DET.has(ts[j]?.lower ?? '') || PLURAL_DET.has(ts[j]?.lower ?? '')) j++;
    const end = phraseEnd(ts, j, 3);
    if (end === j && !['us', 'them', 'you'].includes(ts[j]?.lower ?? '')) return null;
    const after = end === j ? j + 1 : end;
    return { head: t, number: 'one', next: after, adjacent: false };
  }
  // "Neither the cook nor the waiters": the nearer one decides.
  if (t.lower === 'neither' || t.lower === 'either') {
    const joiner = t.lower === 'neither' ? 'nor' : 'or';
    const k = ts.findIndex((x, n) => n > i && n <= i + 5 && x.lower === joiner);
    if (k < 0) return null;
    const second = subjectAt(ts, k + 1, isWord) ?? bareNoun(ts, k + 1, isWord);
    return second && { ...second, adjacent: false };
  }
  let j = i;
  let detNumber: 'one' | 'many' | null = null;
  if (SINGULAR_DET.has(t.lower)) detNumber = 'one';
  else if (PLURAL_DET.has(t.lower)) detNumber = 'many';
  else if (!OPEN_DET.has(t.lower) && !/'s$/.test(t.lower)) return null;
  j++;
  const end = phraseEnd(ts, j, 4);
  if (end === j) return null;
  const phrase: [number, number] = [j, end];
  const head = ts[end - 1]!;
  const number = nounNumber(head.lower, isWord);
  if (!number) return null;
  if (detNumber && detNumber !== number) return null;
  // "of the onions", "in the jar", "near the window": skip to the verb.
  let next = end;
  let adjacent = true;
  let closed = false;
  for (let hops = 0; hops < 2; hops++) {
    const n = ts[next];
    if (!n) break;
    const commaBefore = /,/.test(n.gap);
    const along = ALONG.find((words) => words.every((w, k) => ts[next + k]?.lower === w));
    if (commaBefore && along) {
      // ", along with the notes," must close with a comma before the verb.
      let k = next + along.length;
      while (k < ts.length && k - next < 8 && !/,/.test(ts[k]!.gap) && !ts[k]!.start) k++;
      if (!ts[k] || !/,/.test(ts[k]!.gap)) return null;
      next = k;
      adjacent = false;
      closed = true;
      break;
    }
    if (commaBefore || !PREPOSITIONS.has(n.lower)) break;
    let k = next + 1;
    if (OPEN_DET.has(ts[k]?.lower ?? '') || SINGULAR_DET.has(ts[k]?.lower ?? '') || PLURAL_DET.has(ts[k]?.lower ?? '')) k++;
    const e = phraseEnd(ts, k, 4);
    if (e === k) return null;
    next = e;
    adjacent = false;
  }
  if (!closed && /,/.test(ts[next]?.gap ?? '')) return null;
  return { head, number, next, adjacent, phrase };
}

/** A plural noun on its own, as in "Children was" or "nor the waiters was". */
function bareNoun(ts: Token[], i: number, isWord: IsWord): Subject | null {
  const t = ts[i];
  if (!t) return null;
  const number = nounNumber(t.lower, isWord);
  if (number !== 'many' || !IRREGULAR_PLURALS.has(t.lower)) return null;
  return { head: t, number, next: i + 1, adjacent: true };
}

const issue = (from: number, to: number, rule: string, message: string, suggestions: string[]): Issue => ({ from, to, kind: 'grammar', rule, message, suggestions });

/** Subject and verb agreement. */
function agreement(ts: Token[], isWord: IsWord, counts: Counts[], out: Issue[]) {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const prev = ts[i - 1];
    const before = ts.slice(Math.max(0, i - 3), i).map((x) => x.lower);
    // They, we or you with was; he, she or it with were, outside "if he were".
    const verb = ts[i + 1];
    if (verb && /^\s+$/.test(verb.gap)) {
      if (['they', 'we', 'you'].includes(t.lower) && (verb.lower === 'was' || verb.lower === "wasn't")) {
        const fix = verb.lower === 'was' ? 'were' : "weren't";
        out.push(issue(verb.from, verb.to, 'agreement', `With “${t.word.toLowerCase()}”, it’s “${fix}”.`, [matchCase(verb.word, fix)]));
        continue;
      }
      if (['he', 'she', 'it'].includes(t.lower) && (verb.lower === 'were' || verb.lower === "weren't") && !before.some((w) => SUBJUNCTIVE.has(w)) && prev?.lower !== 'as' && ts[i + 2]?.lower !== 'to') {
        const fix = verb.lower === 'were' ? 'was' : "wasn't";
        out.push(issue(verb.from, verb.to, 'agreement', `With “${t.word.toLowerCase()}”, it’s “${fix}”.`, [matchCase(verb.word, fix)]));
        continue;
      }
      if (['he', 'she', 'it'].includes(t.lower) && ['have', "haven't"].includes(verb.lower) && !AUXILIARIES.has(prev?.lower ?? '')) {
        const fix = verb.lower === 'have' ? 'has' : "hasn't";
        out.push(issue(verb.from, verb.to, 'agreement', `With “${t.word.toLowerCase()}”, it’s “${fix}”.`, [matchCase(verb.word, fix)]));
        continue;
      }
      if (['they', 'we', 'you', 'i'].includes(t.lower) && ['has', "hasn't"].includes(verb.lower)) {
        const fix = verb.lower === 'has' ? 'have' : "haven't";
        out.push(issue(verb.from, verb.to, 'agreement', `With “${t.word === 'I' ? 'I' : t.word.toLowerCase()}”, it’s “${fix}”.`, [matchCase(verb.word, fix)]));
        continue;
      }
      // Everyone, nobody and the like are one.
      if (['everyone', 'everybody', 'someone', 'somebody', 'anyone', 'anybody', 'nobody', 'everything', 'something', 'nothing'].includes(t.lower) && PLURAL_BE[verb.lower] && !AUXILIARIES.has(prev?.lower ?? '') && !['are', 'were', 'have', 'do'].includes(prev?.lower ?? '')) {
        const fix = PLURAL_BE[verb.lower]!;
        out.push(issue(verb.from, verb.to, 'agreement', `“${t.word.toLowerCase()}” is one person or thing, so it’s “${fix}”.`, [matchCase(verb.word, fix)]));
        continue;
      }
    }
    // "There’s three eggs", "There was two of them".
    if ((t.lower === 'there' || t.lower === 'here') && verb && ['is', 'was'].includes(verb.lower) && NUMBER_WORDS.has(ts[i + 2]?.lower ?? '')) {
      const fix = verb.lower === 'is' ? 'are' : 'were';
      out.push(issue(verb.from, verb.to, 'agreement', `There’s more than one, so it’s “${fix}”.`, [matchCase(verb.word, fix)]));
      continue;
    }
    if ((t.lower === "there's" || t.lower === "here's") && NUMBER_WORDS.has(ts[i + 1]?.lower ?? '')) {
      const fix = `${t.word.slice(0, -2)} are`;
      out.push(issue(t.from, t.to, 'agreement', `There’s more than one, so it’s “${fix.toLowerCase()}”.`, [fix]));
      continue;
    }
    // Clause subjects: "The list of ingredients are".
    if (!t.start && !['when', 'while', 'because', 'although', 'though', 'since', 'until', 'unless', 'once', 'whereas'].includes(prev?.lower ?? '')) continue;
    if (prev && ['if', 'though', 'as'].includes(prev.lower)) continue;
    const subject = subjectAt(ts, i, isWord) ?? (t.start ? bareNoun(ts, i, isWord) : null);
    if (!subject) continue;
    const v = ts[subject.next];
    const head = subject.head.lower;
    const wrongOne = v && !v.start && subject.number === 'one' && PLURAL_BE[v.lower];
    const wrongMany = v && !v.start && subject.number === 'many' && SINGULAR_BE[v.lower];
    if (v && (wrongOne || wrongMany)) {
      const fix = (wrongOne ? PLURAL_BE[v.lower] : SINGULAR_BE[v.lower])!;
      // The books know better: "the news was", "the police were".
      if (subject.adjacent && pairCount(counts, head, v.lower) >= Math.max(1, pairCount(counts, head, fix))) continue;
      const what = subject.number === 'one' ? 'is one' : 'are more than one';
      const msg = subject.adjacent ? `“${subject.head.word.toLowerCase()}” ${what}, so it’s “${fix}”.` : `The subject is “${subject.head.word.toLowerCase()}”, which ${what === 'is one' ? 'is one' : 'is more than one'}, so it’s “${fix}”.`;
      out.push(issue(v.from, v.to, 'agreement', msg, [matchCase(v.word, fix)]));
      continue;
    }
    // "The dogs runs across the yard": a plural noun, then a verb ending in s. The phrase took the verb in as a describing word.
    const [p0, p1] = subject.phrase ?? [0, 0];
    if (p1 - p0 < 2) continue;
    const noun = ts[p1 - 2]!;
    const runs = ts[p1 - 1]!;
    if (nounNumber(noun.lower, isWord) !== 'many' || !/[^s]s$/.test(runs.lower) || /'/.test(runs.lower) || S_SINGULARS.has(runs.lower)) continue;
    const after = ts[p1];
    const endsHere = !after || after.start || /,/.test(after.gap);
    if (!endsHere && !AFTER_VERB.has(after.lower)) continue;
    const stem = [runs.lower.replace(/ies$/, 'y'), runs.lower.replace(/(?<=(?:ch|sh|ss|x|z|o))es$/, ''), runs.lower.slice(0, -1)].find((s) => s !== runs.lower && isWord(s));
    if (!stem) continue;
    if (pairCount(counts, noun.lower, runs.lower) > pairCount(counts, noun.lower, stem)) continue;
    out.push(issue(runs.from, runs.to, 'agreement', `“${noun.word.toLowerCase()}” are more than one, so it’s “${stem}”.`, [matchCase(runs.word, stem)]));
  }
}

/** your/you’re, their/they’re, less/fewer, loose/lose. */
function mixups(ts: Token[], isWord: IsWord, out: Issue[]) {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    const next = ts[i + 1];
    const after = ts[i + 2];
    const prev = ts[i - 1];
    if (!next || next.start) continue;
    if (t.lower === 'your' || t.lower === 'their') {
      const fix = t.lower === 'your' ? 'you’re' : 'they’re';
      const ending = !after || after.start || /,/.test(after.gap);
      const going = /ing$/.test(next.lower) && !ING_NOUNS.has(next.lower) && after?.lower === 'to' && !after.start;
      const plain = ['not', 'so', 'too', 'a', 'an', 'the', 'gonna'].includes(next.lower) || (['welcome', 'kidding', 'joking', 'right', 'wrong'].includes(next.lower) && ending);
      if (going || plain) out.push(issue(t.from, t.to, 'word-mixup', `“${t.word.toLowerCase()}” means belonging to ${t.lower === 'your' ? 'you' : 'them'}. Here it’s “${fix}”.`, [matchCase(t.word, fix)]));
      continue;
    }
    if (t.lower === 'less' && nounNumber(next.lower, isWord) === 'many' && !COLLECTIVE.has(next.lower)) {
      out.push(issue(t.from, t.to, 'word-mixup', `“${next.word}” can be counted, so it’s “fewer”.`, [matchCase(t.word, 'fewer')]));
      continue;
    }
    if (t.lower === 'loose' && BEFORE_LOSE.has(prev?.lower ?? '') && OBJECTS_OF_LOSE.has(next.lower)) {
      out.push(issue(t.from, t.to, 'word-mixup', '“Loose” means not tight. To misplace something is to “lose” it.', [matchCase(t.word, 'lose')]));
      continue;
    }
    if (t.lower === 'loosing' && OBJECTS_OF_LOSE.has(next.lower)) {
      out.push(issue(t.from, t.to, 'word-mixup', '“Loosing” is letting go of something tight. Misplacing it is “losing”.', [matchCase(t.word, 'losing')]));
    }
  }
}

/** "Me and him went", "between you and I". */
function pronounCase(ts: Token[], out: Issue[]) {
  for (let i = 0; i + 2 < ts.length; i++) {
    const [a, and, b] = [ts[i]!, ts[i + 1]!, ts[i + 2]!];
    if (and.lower !== 'and' || and.start || b.start) continue;
    const verb = ts[i + 3];
    const goesOn = verb && !verb.start && !/,/.test(verb.gap);
    // At the start of a clause, before a verb: "Me and him went".
    if (a.start && goesOn && (a.lower === 'me' || SUBJECT_OF[a.lower]) && (b.lower === 'me' || b.lower === 'i' || SUBJECT_OF[b.lower] || /^\p{Lu}/u.test(b.word))) {
      const other = a.lower === 'me' ? b : a;
      const subject = other.lower === 'me' || other.lower === 'i' ? null : (SUBJECT_OF[other.lower] ?? other.word);
      if (!subject) continue;
      const fix = `${matchCase(a.word, subject)} and I`;
      out.push(issue(a.from, b.to, 'pronoun-case', 'Before a verb it’s “I” and “he”, not “me” and “him”, and “I” goes last.', [fix]));
      continue;
    }
    // After a preposition: "between you and I".
    const prep = ts[i - 1];
    if (b.word === 'I' && prep && CASE_PREPOSITIONS.has(prep.lower) && !a.start && ['you', 'him', 'her', 'them', 'us'].includes(a.lower)) {
      out.push(issue(b.from, b.to, 'pronoun-case', `After “${prep.word.toLowerCase()}”, it’s “me”, not “I”.`, ['me']));
    }
  }
}

/** "I seen", "she lay the book". */
function verbForms(ts: Token[], out: Issue[]) {
  for (let i = 0; i + 1 < ts.length; i++) {
    const [t, v] = [ts[i]!, ts[i + 1]!];
    if (v.start) continue;
    if (SEEN_SUBJECTS.has(t.lower) && v.lower === 'seen') {
      out.push(issue(v.from, v.to, 'verb-form', '“Seen” needs a helper, as in “have seen”. On its own it’s “saw”.', ['saw', `${t.lower === 'he' || t.lower === 'she' || t.lower === 'it' ? 'has' : 'have'} seen`]));
      continue;
    }
    if (SEEN_SUBJECTS.has(t.lower) && v.lower === 'done' && ts[i + 2] && !ts[i + 2]!.start && ['it', 'that', 'this', 'the', 'my', 'his', 'her', 'their', 'our', 'what', 'everything', 'nothing', 'something'].includes(ts[i + 2]!.lower)) {
      out.push(issue(v.from, v.to, 'verb-form', '“Done” needs a helper, as in “have done”. On its own it’s “did”.', ['did']));
      continue;
    }
    // He, she or it with "lay" and an object: "lays" now, "laid" before.
    const obj = ts[i + 2];
    if (['he', 'she', 'it'].includes(t.lower) && v.lower === 'lay' && obj && !obj.start && ['the', 'a', 'an', 'his', 'her', 'its', 'their', 'my', 'your', 'our', 'it', 'them', 'him'].includes(obj.lower)) {
      out.push(issue(v.from, v.to, 'verb-form', 'To put something down is “lay”, so in the past it’s “laid” (or “lays” now). “She lay” means she was lying down.', ['laid', 'lays']));
    }
  }
}

/** "He asked where are you going?" reads better as "He asked where you were going." */
function reportedQuestions(text: string, ts: Token[], out: Issue[]) {
  for (let i = 0; i + 3 < ts.length; i++) {
    const [ask, wh, aux, who] = [ts[i]!, ts[i + 1]!, ts[i + 2]!, ts[i + 3]!];
    if (!ASKING.has(ask.lower) || !QUESTION_WORDS.has(wh.lower) || wh.start || aux.start || who.start) continue;
    if (/[,:]/.test(wh.gap)) continue;
    if (!PRONOUNS.has(who.lower) || !(SWAPPABLE_AUX.has(aux.lower) || DO_AUX.has(aux.lower))) continue;
    const end = text.indexOf('?', who.to);
    if (end < 0 || CLAUSE_BREAK.test(text.slice(who.to, end).replace(/[?]/g, ''))) continue;
    const message = 'This question is told, not asked: the words go in telling order and it ends with a full stop.';
    if (DO_AUX.has(aux.lower)) {
      out.push(issue(wh.from, end + 1, 'reported-question', message, []));
      continue;
    }
    const rest = text.slice(who.to, end);
    out.push(issue(wh.from, end + 1, 'reported-question', message, [`${wh.word} ${who.word === 'I' ? 'I' : who.word.toLowerCase()} ${aux.word.toLowerCase()}${rest}.`]));
  }
}

/** Pete's own issues in one paragraph. `counts` are Sam's word pairs: the books' and the writer's own. */
export function peteIssues(text: string, isWord: IsWord, counts: Counts[] = []): Issue[] {
  const speech = dialogueRanges(text);
  const inSpeech = (i: Issue) => speech.some(([a, b]) => i.from < b && i.to > a);
  const ts = tokens(text);
  const out: Issue[] = [];
  agreement(ts, isWord, counts, out);
  mixups(ts, isWord, out);
  pronounCase(ts, out);
  verbForms(ts, out);
  reportedQuestions(text, ts, out);
  const kept: Issue[] = [];
  for (const i of out.sort((a, b) => a.from - b.from || b.to - a.to)) {
    if (inSpeech(i) || kept.some((k) => i.from < k.to && i.to > k.from)) continue;
    kept.push(i);
  }
  return kept;
}

const overlaps = (a: Issue, b: Issue) => a.from < b.to && a.to > b.from;

/**
 * One paragraph's issues from every check. Pete's own grammar checks (and
 * the unclosed quote and stray capitals among the style ones) know better
 * than Harper on the same words; style notes give way to any mistake, though
 * a whole sentence can hold both.
 */
export function combine(spelling: Issue[], harper: Issue[], own: Issue[], style: Issue[], isSentenceRule: (rule: string) => boolean): Issue[] {
  const pete: Issue[] = [];
  for (const i of [...own, ...style.filter((s) => s.kind === 'grammar')]) {
    if (!spelling.some((s) => overlaps(s, i)) && !pete.some((p) => overlaps(p, i))) pete.push(i);
  }
  const marked = [...spelling, ...harper.filter((h) => !pete.some((p) => overlaps(p, h))), ...pete];
  const notes = style.filter((s) => s.kind !== 'grammar' && (isSentenceRule(s.rule) || !marked.some((m) => overlaps(m, s))));
  return [...marked, ...notes].sort((a, b) => a.from - b.from);
}
