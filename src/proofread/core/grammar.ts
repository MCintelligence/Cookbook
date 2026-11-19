import { type Issue } from '../check';
import { type Counts } from '../context';
import {
  ADJECTIVE_PREPOSITION,
  BELONGINGS,
  COUNTED_PEOPLE,
  BETWEEN,
  DIRECT_OBJECT,
  EVENTS,
  FEELINGS,
  GOING,
  GOVERNS,
  GROUPS,
  HOW_OFTEN,
  INTENSIFIERS,
  LINKING,
  MANY,
  NEEDS_PREPOSITION,
  NO_INDIRECT_OBJECT,
  ONE,
  PEOPLE,
  PLACES,
  PREPOSITIONS_BEFORE_ING,
  SAME_NUMBER,
  SHARE_COUNTED,
  TIME_NOUNS,
  TO_ADJECTIVE,
  TWO_OBJECTS,
} from './frames';
import { type VerbForm, useNounEvidence, hasDictionary, isAdjective, isNoun, isWord, partsOf, pluralNoun, readVerb, regularisedPlural, singular } from './lexicon';

/**
 * Peppery Pete's grammar of English. A few principles do the work, and each check below is one
 * of them applied:
 *
 * 1. A helper verb decides the form of the verb it governs: "could go", "has gone", "was eaten",
 *    "is eating", "interested in learning".
 * 2. A noun agrees in number with what counts it: "every student", "these books", "one of the students".
 * 3. A verb or describing word takes the preposition its frame names, and no other: "discuss it",
 *    "listen to it", "angry with him".
 * 4. A noun that owns the next one takes 's: "my sister's car".
 * 5. A word that describes a noun, or follows "very", is a describing word: "a very beautiful woman".
 *    A feeling's -ing form is the cause and its -ed form the one who feels it.
 * 6. Clauses telling one story keep one time: "she was tired, so she went to bed".
 *
 * The words come from the lexicon (Sam's dictionary) and the frames (core/frames.ts). Book
 * counts of word pairs are a last guard: a pair English writes thousands of times is English,
 * whatever the grammar thinks, so nothing common in published fiction is underlined.
 */

export interface Term {
  word: string;
  lower: string;
  from: number;
  to: number;
  tags: Set<string>;
  post: string;
}

export interface Sentence {
  from: number;
  to: number;
  terms: Term[];
}

const issue = (from: number, to: number, rule: string, message: string, suggestions: string[] = []): Issue => ({ from, to, kind: 'grammar', rule, message, suggestions });

const DETERMINERS = new Set('a an the this that these those my your his her its our their each every some any no another either neither'.split(' '));
const POSSESSIVES = new Set('my your his her its our their'.split(' '));
const SUBJECTS = new Set('i you he she it we they'.split(' '));
const OBJECT_PRONOUNS = new Set('me him her us them'.split(' '));
const BE = new Set(['am', 'is', 'are', 'was', 'were', "i'm", "'m", "'re"]);
const PAST_BE = new Set(['was', 'were']);
const QUANTITY = new Set('few couple lot lots dozen hundred thousand million great good number half one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty more less most least other'.split(' '));

/** Whether a word ends where its clause goes on: a comma, full stop, dash or quote after it, or nothing. */
const pauses = (t: Term | undefined) => !t || /[^\s'’-]|--/.test(t.post);
const NUMBERS = new Set('two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred'.split(' '));
const before0 = (ts: Term[], i: number) => ts[i - 1];
const capital = (t: Term) => /^\p{Lu}/u.test(t.word);
const keepCase = (like: string, w: string) => (/^\p{Lu}/u.test(like) ? w[0]!.toUpperCase() + w.slice(1) : w);
const tagged = (t: Term | undefined, tag: string) => !!t && t.tags.has(tag);

function pairsOf(counts: Counts[]) {
  return (a: string, b: string) => counts.reduce((n, c) => n + (c.pairs.get(`${a} ${b}`) ?? 0), 0);
}
type Pair = ReturnType<typeof pairsOf>;

/** Books put this word after "the" or "a": it's used as a noun, whatever else it is. */
const nounish = (w: string, pair: Pair) => pair('the', w) + pair('a', w) + pair('an', w) + pair('his', w) + pair('her', w) > 0;
/** Books put this word after "very" or "so", or the dictionary compares it: a describing word. */
const describes = (w: string, pair: Pair) => isAdjective(w) || pair('extremely', w) + pair('somewhat', w) + pair('fairly', w) + pair('quite', w) > 0;
/**
 * A noun English counts ("a car", "two cars") rather than measures ("much water"): books put
 * "a" before it often and "much" never. Such a noun can't stand alone in the singular.
 */
function counted(w: string, pair: Pair, counts: Counts[], least = 0.25): boolean {
  const n = counts.reduce((s, c) => s + (c.words.get(w) ?? 0), 0);
  if (n < 50) return false;
  return (pair('a', w) + pair('an', w)) / n >= least && pair('much', w) === 0 && pair('some', w) / n < 0.01 && !/(?:ness|tion|sion|ment|ity|ance|ence|ship|ism|ure)$/.test(w);
}

/** The verb a helper governs, past any "not", "never" or "already" in between. */
function governed(ts: Term[], at: number): number {
  let k = at + 1;
  while (k < ts.length && k <= at + 3 && BETWEEN.has(ts[k]!.lower) && !pauses(ts[k - 1])) k++;
  return k < ts.length && !pauses(ts[k - 1]) ? k : -1;
}

const NAMES: Record<VerbForm, string> = { base: 'plain form', present: 'present', past: 'past', participle: 'past participle', ing: '-ing form' };

/** 1. A helper verb governs the form of the verb after it. */
function helpers(ts: Term[], pair: Pair, out: Issue[]) {
  ts.forEach((h, i) => {
    let lower = h.lower;
    if (lower === "i'm") lower = 'am';
    const wants = GOVERNS[lower] ?? (/n't$/.test(lower) ? GOVERNS[lower.replace(/n't$/, '')] : undefined);
    if (!wants) return;
    const before = ts[i - 1];
    // "the will", "a can of beans", "in May": the noun, not the helper. A helper ends at a quote: "'You won't' thought Alice".
    if (before && (DETERMINERS.has(before.lower) || tagged(before, 'Adjective'))) return;
    if (/['’]/.test(h.post)) return;
    if (/^(?:will|can|may|must)$/.test(lower) && before && (tagged(before, 'Verb') || describes(before.lower, pair))) return;
    if (lower === 'may' && capital(h) && i > 0) return;
    let k = governed(ts, i);
    // "Did you went?", "Can she swims?": in a question the subject comes between.
    if (k >= 0 && i === 0 && SUBJECTS.has(ts[k]!.lower) && !wants.includes('ing')) k = governed(ts, k);
    if (k < 0) return;
    const v = ts[k]!;
    if ((capital(v) && k > 0) || v.post.startsWith('-')) return;
    const reading = readVerb(v.lower);
    if (!reading || wants.some((f) => reading.forms.has(f))) return;
    // A word common straight after this helper in published books is fine there ("was like", "has had").
    if (pair(h.lower.replace(/^i'm$/, 'am'), v.lower) > 0) return;
    const parts = partsOf(reading.base);
    const isBe = wants.includes('ing');
    // "had faults", "was want of spirit", "always clean shoes": the word is working as a noun or describing word.
    const pastOnly = reading.forms.has('past') && !reading.forms.has('base') && !reading.forms.has('present');
    // After "will" or "did" with a subject before it, an -s form can only be a verb: "the scraping will causes".
    // Not after "do": "do cats eat bats?" asks a question with "cats" as its subject.
    const sForm = !isBe && wants[0] === 'base' && !/^(?:do|does|did|don't|doesn't|didn't)$/.test(lower) && reading.forms.has('present') && !reading.forms.has('base') && /s$/.test(v.lower) && !!before && !pauses(before) && !/['’]s$/.test(before.word);
    if (!pastOnly && !sForm && (nounish(v.lower, pair) || describes(v.lower, pair) || tagged(v, 'Adjective'))) return;
    if (tagged(v, 'Noun') && !tagged(v, 'Verb') && !pastOnly && !sForm) return;
    if (isBe) {
      // "was eat", "were expose", "was took": a passive needs the participle. A plain verb that is
      // also a noun or describing word ("was love", "is open") is left to the counts: it must be
      // rare after "was" while its participle is common there.
      const noun = isNoun(v.lower) || isAdjective(v.lower);
      if (reading.forms.has('present') && !reading.forms.has('base')) return;
      if (noun && pair(lower, parts.participle) < 3) return;
      if (!noun && !reading.forms.has('past') && !reading.forms.has('base')) return;
      if (/^(?:broke|sank|drank|rang|sang|shrank|sprang|stank|swam)$/.test(v.lower) && !noun && pair(lower, parts.participle) < 1) return;
      out.push(issue(v.from, v.to, 'verb-after-modal', `After “${h.word}”, the verb takes its past participle: “${parts.participle}”.`, [keepCase(v.word, parts.participle)]));
      return;
    }
    const want = wants[0]!;
    // "has eat": a plain verb after "have" only counts when it can't be a noun ("has work").
    if (want === 'participle' && reading.forms.has('base') && isNoun(v.lower)) return;
    if (want === 'base' && isNoun(v.lower) && !sForm && !reading.forms.has('past') && !reading.forms.has('participle')) return;
    const fix = want === 'base' ? parts.base : parts.participle;
    if (fix === v.lower) return;
    out.push(issue(v.from, v.to, 'verb-after-modal', `After “${h.word}”, the verb takes its ${NAMES[want]}: “${fix}”.`, [keepCase(v.word, fix)]));
  });
  // "to went", "to goes": the infinitive is the plain form.
  ts.forEach((t, i) => {
    const v = ts[i + 1];
    if (t.lower !== 'to' || !v || pauses(t) || capital(v)) return;
    const reading = readVerb(v.lower);
    if (!reading || reading.forms.has('base') || reading.forms.has('participle') || isNoun(v.lower) || tagged(v, 'Noun') || nounish(v.lower, pair) || nounish(singular(v.lower) ?? '', pair)) return;
    if (!reading.forms.has('past') && !reading.forms.has('present')) return;
    if (pair('to', v.lower) > 0) return;
    out.push(issue(v.from, v.to, 'verb-after-modal', `After “to”, the verb takes its plain form: “${reading.base}”.`, [keepCase(v.word, reading.base)]));
  });
  // "interested in learn": a preposition takes the -ing form.
  ts.forEach((p, i) => {
    const v = ts[i + 1];
    if (!PREPOSITIONS_BEFORE_ING.has(p.lower) || !v || pauses(p) || capital(v) || v.post.startsWith('-')) return;
    const before = ts[i - 1];
    // "gave in", "carry on": after a verb, the word may be part of it.
    if (before && readVerb(before.lower) && !isAdjective(before.lower) && !ADJECTIVE_PREPOSITION[before.lower] && !isNoun(before.lower)) return;
    const reading = readVerb(v.lower);
    if (!reading || !reading.forms.has('base') || isNoun(v.lower) || isAdjective(v.lower) || tagged(v, 'Adverb') || v.lower.length < 3) return;
    if (nounish(v.lower, pair) || describes(v.lower, pair)) return;
    if (pair(p.lower, v.lower) > 0 || ts[i + 2]?.lower === 'to') return;
    const ing = partsOf(reading.base).ing;
    if (!isWord(ing)) return;
    out.push(issue(v.from, v.to, 'verb-after-modal', `After “${p.word}”, a verb takes -ing: “${ing}”.`, [ing]));
  });
}

/** Where a noun phrase starting at `at` ends, skipping describing words: the last noun of a run of nouns. */
function head(ts: Term[], at: number): number {
  let k = at;
  while (k < ts.length && k < at + 4 && !pauses(ts[k - 1]) && (isAdjective(ts[k]!.lower) || tagged(ts[k], 'Adjective')) && !isNoun(ts[k]!.lower)) k++;
  if (k >= ts.length || (k > 0 && pauses(ts[k - 1]))) return -1;
  if (!isNoun(ts[k]!.lower)) return -1;
  // A noun before a noun describes it ("book covers"), and such a noun is singular: a plural, or
  // one with an apostrophe after it ("minutes' talk"), is the head itself.
  while (k + 1 < ts.length && ts[k]!.post === '-') k++;
  while (
    k + 1 < ts.length &&
    !pauses(ts[k]) &&
    !TIME_NOUNS.has(ts[k]!.lower) &&
    !/['’]/.test(ts[k]!.post) &&
    !singular(ts[k]!.lower) &&
    isNoun(ts[k + 1]!.lower) &&
    !isAdjective(ts[k + 1]!.lower) &&
    !tagged(ts[k + 1], 'Verb') &&
    !tagged(ts[k + 1], 'Adverb') &&
    !/ing$/.test(ts[k + 1]!.lower) &&
    !readVerb(ts[k + 1]!.lower)?.forms.has('past') &&
    !SUBJECTS.has(ts[k + 1]!.lower)
  )
    k++;
  return k;
}

/** A word that may come after a noun phrase without being part of it. */
const afterPhrase = (t: Term | undefined) => !t || tagged(t, 'Verb') || tagged(t, 'Preposition') || tagged(t, 'Conjunction') || /^(?:who|that|which|and|or|but)$/.test(t.lower);

/** 2. A noun agrees in number with what counts it. */
function number(ts: Term[], pair: Pair, counts: Counts[], out: Issue[]) {
  ts.forEach((d, i) => {
    const one = ONE.has(d.lower);
    const many = MANY.has(d.lower);
    if ((!one && !many) || pauses(d)) return;
    const next = ts[i + 1];
    if (!next || QUANTITY.has(next.lower) || next.lower === 'of' || /^\d/.test(next.word) || next.lower === 'a') return;
    // "two book" and "this apples" are the learner checks' already.
    if (/^(?:two|three|four|five|six|seven|eight|nine|ten|twenty|this|that)$/.test(d.lower)) return;
    const k = head(ts, i + 1);
    if (k < 0) return;
    const n = ts[k]!;
    if (capital(n) || ts.slice(i + 1, k).some((t) => QUANTITY.has(t.lower)) || SAME_NUMBER.has(n.lower) || /ics$/.test(n.lower) || !afterPhrase(ts[k + 1]) && !pauses(n)) return;
    // "both husband and wife", "a numerous family", "a woman does marry".
    const coordinated = /^(?:both|either|neither)$/.test(d.lower) && /^(?:and|or|nor)$/.test(ts[k + 1]?.lower ?? '');
    const objectAfter = !!ts[k + 1] && (DETERMINERS.has(ts[k + 1]!.lower) || OBJECT_PRONOUNS.has(ts[k + 1]!.lower) || POSSESSIVES.has(ts[k + 1]!.lower));
    if (coordinated || (tagged(n, 'Verb') && (objectAfter || !pauses(n))) || (before0(ts, i) && /^(?:a|an|the|most|more)$/.test(before0(ts, i)!.lower))) return;
    // "a porpoise spouts", "each lad passes": a singular noun and then its verb.
    if (k > i + 1 && isNoun(ts[k - 1]!.lower) && !singular(ts[k - 1]!.lower) && readVerb(n.lower)?.forms.has('present')) return;
    if (isNoun(ts[k + 1]?.lower ?? '') && !pauses(n)) return;
    if (one) {
      const sing = singular(n.lower);
      if (!sing || readVerb(n.lower)?.forms.has('present') && !pauses(n) && !tagged(ts[k + 1], 'Verb')) return;
      if (pair(d.lower, n.lower) > 0 || pair(d.lower, sing) === 0 && pair('the', sing) === 0) return;
      out.push(issue(n.from, n.to, 'noun-number', `After “${d.word}”, it’s one: “${sing}”.`, [keepCase(n.word, sing)]));
    } else {
      if (singular(n.lower) || /s$/.test(n.lower) && !isNoun(n.lower.slice(0, -1)) && n.lower.endsWith('ss') === false) return;
      if (/^(?:kind|sort|type|lot|bit|room)$/.test(n.lower) || describes(n.lower, pair) || tagged(n, 'Adjective')) return;
      const plural = pluralNoun(n.lower);
      if (!isWord(plural) || pair(d.lower, n.lower) > 0 || pair(d.lower, plural) + pair('the', plural) + pair('many', plural) === 0) return;
      out.push(issue(n.from, n.to, 'noun-number', `After “${d.word}”, it’s more than one: “${plural}”.`, [keepCase(n.word, plural)]));
    }
  });
  // "this animals": "this" counts one. Not "that", which also starts a clause ("I know that people …").
  ts.forEach((d, i) => {
    const n = ts[i + 1];
    if (d.lower !== 'this' || !n || pauses(d) || capital(n)) return;
    const one = singular(n.lower);
    if (!one || SAME_NUMBER.has(n.lower) || readVerb(n.lower)?.forms.has('present')) return;
    if (!(pauses(n) || afterPhrase(ts[i + 2])) || (isNoun(ts[i + 2]?.lower ?? '') && !tagged(ts[i + 2], 'Verb')) || pair('this', n.lower) > 0) return;
    out.push(issue(d.from, d.to, 'noun-number', `“${n.word}” is more than one, so it’s “these”.`, [keepCase(d.word, 'these')]));
  });
  // "a lot of scientist", "the number of car": a count of things takes the plural.
  ts.forEach((q, i) => {
    const of = ts[i + 1];
    const n = ts[i + 2];
    if (!/^(?:lot|lots|number|plenty|couple|variety|kinds|types|sorts|millions|thousands|hundreds|dozens|majority|range)$/.test(q.lower) || of?.lower !== 'of' || !n || pauses(q) || pauses(of) || capital(n)) return;
    if (!isNoun(n.lower) || singular(n.lower) || SAME_NUMBER.has(n.lower) || tagged(n, 'Verb') || describes(n.lower, pair) || (isNoun(ts[i + 3]?.lower ?? '') && !pauses(n))) return;
    if (!counted(n.lower, pair, counts, 0.1)) return;
    const plural = pluralNoun(n.lower);
    if (!isWord(plural) || pair('many', plural) + pair('several', plural) + pair('few', plural) === 0 || pair('of', n.lower) > pair('of', plural) * 3) return;
    out.push(issue(n.from, n.to, 'noun-number', `“${q.word} of” counts many, so it’s “${plural}”.`, [keepCase(n.word, plural)]));
  });
  // "one of the student", "all the student".
  ts.forEach((q, i) => {
    const of = ts[i + 1];
    const share = SHARE_COUNTED.has(q.lower) && of?.lower === 'of';
    const all = (q.lower === 'all' || q.lower === 'both') && of?.lower === 'the';
    if (!share && !all) return;
    const det = share ? ts[i + 2] : of;
    if (!det || !(DETERMINERS.has(det.lower) || POSSESSIVES.has(det.lower)) || ONE.has(det.lower)) return;
    const at = ts.indexOf(det) + 1;
    const k = head(ts, at);
    if (k < 0) return;
    const n = ts[k]!;
    if (capital(n) || singular(n.lower) || GROUPS.has(n.lower) || SAME_NUMBER.has(n.lower) || !afterPhrase(ts[k + 1]) && !pauses(n)) return;
    if (all && !COUNTED_PEOPLE.has(n.lower)) return;
    if (/^(?:kind|sort|type)$/.test(n.lower) || ts.slice(k + 1, k + 4).some((t) => /^(?:and|or)$/.test(t.lower)) || (isNoun(ts[k + 1]?.lower ?? '') && !pauses(n)) || describes(n.lower, pair)) return;
    const plural = pluralNoun(n.lower);
    if (!isWord(plural) || pair(det.lower, plural) === 0) return;
    out.push(issue(n.from, n.to, 'noun-number', `“${q.word} ${share ? 'of ' : ''}${det.word}” means some of many, so it’s “${plural}”.`, [keepCase(n.word, plural)]));
  });
  // "two knifes", "the mouses": a regular plural for a noun English makes irregular.
  ts.forEach((t, i) => {
    const fix = regularisedPlural(t.lower);
    if (!fix || capital(t) || /^(?:persons|cactuses|funguses|octopuses)$/.test(t.lower)) return;
    const before = ts[i - 1];
    const counted = before && (DETERMINERS.has(before.lower) || MANY.has(before.lower) || NUMBERS.has(before.lower) || POSSESSIVES.has(before.lower) || /^\d+$/.test(before.word) || isAdjective(before.lower));
    if (!counted && !/^(?:are|were|have)$/.test(ts[i + 1]?.lower ?? '')) return;
    out.push(issue(t.from, t.to, 'noun-number', `The plural of this word is “${fix}”.`, [fix]));
  });
}

const PREPOSITIONS = new Set('in on at for with from into about without through under over after before during against near behind'.split(' '));
const KINDS = new Set('kind sort type species breed form variety manner piece bit half part'.split(' '));

/**
 * 2c. A singular noun English counts needs a determiner: "works in a factory", not "works in
 * factory". Only after a verb or preposition, with no describing word in between, and never
 * for a pair books write often ("by car", "at night", "in fact"), so idioms stay clean.
 */
function articles(ts: Term[], pair: Pair, counts: Counts[], out: Issue[]) {
  ts.forEach((p, i) => {
    const n = ts[i + 1];
    if (!n || pauses(p) || capital(n) || !/^\p{Ll}+$/u.test(n.word)) return;
    // Only straight after a preposition: after a verb, the word before may be a describing participle ("the hunted whale").
    if (!PREPOSITIONS.has(p.lower)) return;
    if (KINDS.has(ts[i - 1]?.lower ?? '')) return;
    if (!isNoun(n.lower) || singular(n.lower) || !tagged(n, 'Noun') || tagged(n, 'Verb') || tagged(n, 'Adjective') || isAdjective(n.lower) || describes(n.lower, pair)) return;
    const next = ts[i + 2];
    if (next && !pauses(n) && (isNoun(next.lower) || next.lower === 'of' || /^(?:and|or)$/.test(next.lower) || tagged(next, 'Adjective') || tagged(next, 'Participle') || /['’]/.test(n.post))) return;
    // "from door to door", "hand in hand".
    if (ts.slice(i + 2, i + 5).some((t) => t.lower === n.lower) || ts.slice(Math.max(0, i - 3), i).some((t) => t.lower === n.lower)) return;
    if (pair(p.lower, n.lower) > 0 || !counted(n.lower, pair, counts)) return;
    const a = /^[aeiou]/.test(n.lower) && !/^(?:uni|use|usu|eu|one|once)/.test(n.lower) ? 'an' : 'a';
    out.push(issue(n.from, n.to, 'missing-article', `A single “${n.word}” needs “${a}” or “the” before it.`, [`${a} ${n.word}`, `the ${n.word}`]));
  });
}

/**
 * Punctuation: a comma after a long opening phrase or clause, before the main subject:
 * "In the case of young people, the best way is". Only openings of five words or more, where
 * the main clause starts plainly with a subject and its verb.
 */
const OPENERS = new Set('in on at for during after before since because although though when while if unless as according despite'.split(' '));
function introComma(ts: Term[], out: Issue[]) {
  const [first] = ts;
  if (!first || !OPENERS.has(first.lower)) return;
  const clause = /^(?:because|although|though|when|while|if|unless|since|as|after|before)$/.test(first.lower);
  for (let j = 5; j < Math.min(ts.length - 1, 16); j++) {
    if (pauses(ts[j - 1])) return;
    const s = ts[j]!;
    // The main clause: a subject (a pronoun, or "the best way") and a verb that carries tense.
    const h = /^(?:i|he|she|we|they)$/.test(s.lower) ? j : /^(?:the|my|his|her|our|their|this|these|those)$/.test(s.lower) ? head(ts, j + 1) : -1;
    const v = h >= 0 ? ts[h + 1] : undefined;
    if (!v || ts.slice(j, h + 1).some(pauses) || !tagged(v, 'Verb') || tagged(v, 'Gerund') || tagged(v, 'Infinitive') || tagged(v, 'Participle')) continue;
    if (h !== j && !/^(?:is|are|was|were|has|have|had|will|would|can|could|must|should|may|might)$/.test(v.lower) && !tagged(v, 'PastTense')) continue;
    // In an opening clause the subject comes first: the second subject is the main one.
    if (clause && !ts.slice(1, j).some((t) => /^(?:i|you|he|she|it|we|they)$/.test(t.lower) || tagged(t, 'Noun'))) return;
    if (clause && !ts.slice(1, j).some((t) => tagged(t, 'Verb'))) return;
    // "Before he left he said": the opening must end in a word that can end a phrase.
    const end = ts[j - 1]!;
    if (tagged(end, 'Preposition') || tagged(end, 'Determiner') || tagged(end, 'Conjunction') || /^(?:that|to|and|or|but)$/.test(end.lower)) return;
    out.push(issue(end.from, end.to, 'opening-comma', 'A long opening takes a comma before the main sentence starts.', [`${end.word},`]));
    return;
  }
}

/** 2b. A plural subject takes a plural verb: "The dogs barks" → "bark". */
function agreement(ts: Term[], pair: Pair, out: Issue[]) {
  ts.forEach((d, i) => {
    const before = ts[i - 1];
    if (!(DETERMINERS.has(d.lower) || POSSESSIVES.has(d.lower)) || ONE.has(d.lower) || pauses(d)) return;
    if (before && !pauses(before) && !/^(?:because|when|while|if|although|though|since)$/.test(before.lower)) return;
    const k = head(ts, i + 1);
    if (k < 0 || pauses(ts[k])) return;
    const n = ts[k]!;
    const v = ts[k + 1];
    const one = singular(n.lower);
    if (!v || !one || capital(n) || SAME_NUMBER.has(n.lower) || GROUPS.has(one)) return;
    const reading = readVerb(v.lower);
    if (!reading || !reading.forms.has('present') || reading.forms.has('base') || !/s$/.test(v.lower) || !tagged(v, 'Verb') || /['’]/.test(n.post)) return;
    if (pair(n.lower, v.lower) > 0) return;
    const fix = reading.base === 'be' ? 'are' : reading.base === 'have' ? 'have' : reading.base;
    out.push(issue(v.from, v.to, 'agreement', `“${n.word}” is more than one, so it’s “${fix}”.`, [fix]));
  });
}

/** 3. Each verb and describing word takes the prepositions its frame names. */
function frames(ts: Term[], pair: Pair, out: Issue[]) {
  ts.forEach((v, i) => {
    const before = ts[i - 1];
    const asNoun = (before && (DETERMINERS.has(before.lower) || POSSESSIVES.has(before.lower) || tagged(before, 'Adjective') || tagged(before, 'Ordinal'))) || (tagged(v, 'Noun') && !tagged(v, 'Verb'));
    const reading = readVerb(v.lower);
    const next = ts[i + 1];
    const after = ts[i + 2];
    if (!next || pauses(v) || capital(v) && i > 0) return;
    // An object that no preposition should come before: "discuss about the plan".
    const direct = reading && DIRECT_OBJECT[reading.base];
    if (direct && !asNoun && direct.preps.includes(next.lower) && after && !pauses(next)) {
      const object = DETERMINERS.has(after.lower) || POSSESSIVES.has(after.lower) ? ts[i + 3] : after;
      const fits = !direct.only || (object && direct.only.has(object.lower)) || direct.only.has(after.lower);
      if (fits && (DETERMINERS.has(after.lower) || POSSESSIVES.has(after.lower) || OBJECT_PRONOUNS.has(after.lower) || tagged(after, 'ProperNoun') || isNoun(after.lower))) {
        out.push(issue(v.to, next.to, 'preposition', `“${reading.base}” takes its object straight, with no “${next.word}”.`, ['']));
        return;
      }
    }
    // An object that needs one: "listen the radio", "wait me".
    const needs = reading && NEEDS_PREPOSITION[reading.base];
    if (needs && !asNoun && !tagged(v, 'Noun') || needs && reading && reading.forms.has('past')) {
      const objectStart = OBJECT_PRONOUNS.has(next.lower) || ((DETERMINERS.has(next.lower) || POSSESSIVES.has(next.lower)) && !/^(?:no|either|neither|each|every|any|some|another|that|this)$/.test(next.lower) && reading!.base !== 'agree');
      const object = OBJECT_PRONOUNS.has(next.lower) ? next : after;
      if (objectStart && object && !TIME_NOUNS.has(object.lower) && !TIME_NOUNS.has(ts[i + 3]?.lower ?? '') && !QUANTITY.has(object.lower) && !(next.lower === 'her' && after && isNoun(after.lower) && reading!.base !== 'listen')) {
        if (pair(v.lower, next.lower) === 0) out.push(issue(v.from, v.to, 'preposition', `It’s “${reading!.base} ${needs}”.`, [`${v.word} ${needs}`]));
        return;
      }
    }
    // "explain me the rules".
    if (reading && NO_INDIRECT_OBJECT.has(reading.base) && !asNoun && (next.lower === 'me' || next.lower === 'him' || next.lower === 'us' || next.lower === 'them') && after && !pauses(next) && (DETERMINERS.has(after.lower) || /^(?:what|how|why|where|when|who|that|about)$/.test(after.lower))) {
      out.push(issue(next.from, next.to, 'preposition', `“${reading.base}” doesn’t take a person straight after it: “${reading.base} … to ${next.word}”.`));
      return;
    }
    // "went the beach".
    if (GOING.has(v.lower) && (DETERMINERS.has(next.lower) || POSSESSIVES.has(next.lower)) && !asNoun && !(before && /^(?:in|out|up|down|then|there|here|along|by)$/.test(before.lower))) {
      const place = [ts[i + 2], ts[i + 3]].find((t) => t && PLACES.has(t.lower));
      if (place && !pauses(next) && (place === ts[i + 2] || !pauses(ts[i + 2]))) out.push(issue(v.from, v.to, 'preposition', `You go “to” a place: “${v.word} to”.`, [`${v.word} to`]));
      return;
    }
    // "angry on him".
    const adj = ADJECTIVE_PREPOSITION[v.lower];
    if (adj && adj.wrong.includes(next.lower) && after && !pauses(next) && !readVerb(after.lower)?.forms.has('base')) {
      if (pair(v.lower, next.lower) * 20 > pair(v.lower, adj.right) && pair(v.lower, next.lower) > 0) return;
      out.push(issue(next.from, next.to, 'preposition', `It’s “${v.lower} ${adj.right}”.`, [keepCase(next.word, adj.right)]));
    }
  });
}

/** 4. An owner before the thing owned takes 's. */
function owners(ts: Term[], pair: Pair, out: Issue[]) {
  ts.forEach((o, i) => {
    const b = ts[i + 1];
    if (!b || pauses(o) || !BELONGINGS.has(b.lower) || /['’]/.test(o.word)) return;
    if (!(pauses(b) || afterPhrase(ts[i + 2]) || tagged(ts[i + 2], 'Adverb'))) return;
    const before = ts[i - 1];
    const verbBefore = ts[i - 2];
    if (verbBefore && TWO_OBJECTS.has(readVerb(verbBefore.lower)?.base ?? verbBefore.lower)) return;
    const person = (PEOPLE.has(o.lower) || PEOPLE.has(singular(o.lower) ?? '') || (tagged(o, 'Plural') && PEOPLE.has(o.lower.replace(/s$/, '')))) && before && (POSSESSIVES.has(before.lower) || before.lower === 'the') && !(/^(?:man|woman|boy|girl|child)$/.test(o.lower) && before.lower !== 'the');
    const name = tagged(o, 'FirstName') && capital(o) && i > 0 && before && (tagged(before, 'Preposition') || tagged(before, 'Verb')) && !TWO_OBJECTS.has(readVerb(before.lower)?.base ?? before.lower);
    if (!person && !name) return;
    if (pair(o.lower, b.lower) > 0) return;
    const one = singular(o.lower) ?? (tagged(o, 'Plural') && PEOPLE.has(o.lower.replace(/s$/, '')) ? o.lower.replace(/s$/, '') : null);
    const fix = one && one !== o.lower ? `${o.word.slice(0, one.length)}’s` : `${o.word}’s`;
    const also = one && one !== o.lower ? [`${o.word}’`] : [];
    out.push(issue(o.from, o.to, 'possessive', `The ${b.word} belongs to the ${name ? 'person' : o.word}, so it takes ’s: “${fix} ${b.word}”.`, [fix, ...also]));
  });
}

/** Describing words made from a noun by English's endings, best attested after the word before first. */
function describingFrom(noun: string, before: string, pair: Pair): string | null {
  let best: string | null = null;
  let score = 0;
  for (const [end, add] of TO_ADJECTIVE) {
    if (!end.test(noun)) continue;
    const cand = noun.replace(end, add);
    if (cand === noun || cand.length < 3 || !isWord(cand)) continue;
    const n = pair(before, cand);
    if (n > score) {
      best = cand;
      score = n;
    }
  }
  return best;
}

const NOT_DESCRIBED = new Set('much many few little well best first last same end beginning top bottom idea moment thing man heart least most day word air place existence essence act nature presence fact time point thought least good bad kind'.split(' '));
const ADVERB_ONLY = new Set(['really', 'quite']);

/** 5. A describing word where English wants one. */
function describing(ts: Term[], pair: Pair, out: Issue[]) {
  ts.forEach((v, i) => {
    const n = ts[i + 1];
    if (!INTENSIFIERS.has(v.lower) || !n || pauses(v) || capital(n)) return;
    const before = ts[i - 1];
    if (before && ((DETERMINERS.has(before.lower) && !/^an?$/.test(before.lower)) || POSSESSIVES.has(before.lower))) return;
    if (!isNoun(n.lower) || isAdjective(n.lower) || NOT_DESCRIBED.has(n.lower) || tagged(n, 'Adverb') || singular(n.lower)) return;
    const reading = readVerb(n.lower);
    if (reading && (reading.forms.has('participle') || reading.forms.has('ing') || reading.forms.has('past'))) return;
    if (reading && ADVERB_ONLY.has(v.lower)) return;
    if (pair(v.lower, n.lower) > 0) return;
    const fix = describingFrom(n.lower, v.lower, pair);
    if (!fix) return;
    out.push(issue(n.from, n.to, 'word-form', `“${v.word}” goes with a describing word: “${fix}”.`, [fix]));
  });
  // "a danger road", "a success speech": a noun where English uses its describing word. Only when
  // books never pair the two nouns and do pair the describing word with the second.
  ts.forEach((d, i) => {
    const n = ts[i + 1];
    const m = ts[i + 2];
    if (!/^(?:a|an|the)$/.test(d.lower) || !n || !m || pauses(d) || pauses(n) || capital(n) || capital(m)) return;
    if (!isNoun(n.lower) || isAdjective(n.lower) || singular(n.lower) || readVerb(n.lower) || NOT_DESCRIBED.has(n.lower) || tagged(n, 'Adjective')) return;
    if (!isNoun(m.lower) || tagged(m, 'Verb') || tagged(m, 'Adverb') || readVerb(m.lower)?.forms.has('past') || !(pauses(m) || afterPhrase(ts[i + 3]))) return;
    if (pair(n.lower, m.lower) > 0) return;
    let best: string | null = null;
    let score = 0;
    for (const [end, add] of TO_ADJECTIVE) {
      if (!end.test(n.lower)) continue;
      const cand = n.lower.replace(end, add);
      if (cand === n.lower || cand.length < 4 || !isWord(cand) || isNoun(cand)) continue;
      // The describing word must be one books put before this very noun.
      const k = pair(cand, m.lower);
      if (k > score) {
        best = cand;
        score = k;
      }
    }
    if (!best) return;
    out.push(issue(n.from, n.to, 'word-form', `Before “${m.word}”, use the describing word: “${best}”.`, [best]));
  });
  // A feeling: the film is boring, I am bored.
  ts.forEach((be, i) => {
    if (!BE.has(be.lower) && be.lower !== 'i\'m') return;
    let k = i + 1;
    while (k < ts.length && k <= i + 2 && /^(?:very|so|really|quite|extremely|too|rather|pretty|always|never|not|n't|a|bit|little)$/.test(ts[k]!.lower) && !pauses(ts[k - 1])) k++;
    const f = ts[k];
    if (!f || pauses(ts[k - 1])) return;
    const reading = readVerb(f.lower);
    if (!reading || !(reading.base in FEELINGS)) return;
    const subject = be.lower === "i'm" ? 'i' : ts[i - 1]?.lower;
    const parts = partsOf(reading.base);
    if (reading.forms.has('participle') && f.lower === parts.participle) {
      // A thing that causes the feeling: "the film was bored" → "boring".
      const subj = ts[i - 1];
      if (!subj || !EVENTS.has(subj.lower) || !(DETERMINERS.has(ts[i - 2]?.lower ?? '') || POSSESSIVES.has(ts[i - 2]?.lower ?? ''))) return;
      if (/^(?:by|with|of|at|to|about|in)$/.test(ts[k + 1]?.lower ?? '')) return;
      out.push(issue(f.from, f.to, 'word-form', `The ${subj.word} causes the feeling, so it’s “${parts.ing}”. “${f.word}” is how a person feels.`, [keepCase(f.word, parts.ing)]));
    } else if (reading.forms.has('ing') && (subject === 'i' || subject === 'we')) {
      // The one who feels it: "I am interesting in art" → "interested".
      const p = ts[k + 1];
      if (!p || pauses(f) || !FEELINGS[reading.base]!.includes(p.lower)) return;
      out.push(issue(f.from, f.to, 'word-form', `How you feel is “${parts.participle}”; “${f.word}” is what causes it.`, [keepCase(f.word, parts.participle)]));
    }
  });
  // "seemed happily." → "happy".
  ts.forEach((l, i) => {
    const a = ts[i + 1];
    if (!LINKING.has(l.lower) || !a || pauses(l) || !/ly$/.test(a.lower) || !pauses(a)) return;
    const base = [a.lower.replace(/ily$/, 'y'), a.lower.replace(/ly$/, ''), a.lower.replace(/ly$/, 'le'), a.lower.replace(/ally$/, 'al')].find((b) => b !== a.lower && isWord(b) && isAdjective(b));
    if (!base) return;
    out.push(issue(a.from, a.to, 'word-form', `After “${l.word}”, describe the person or thing: “${base}”.`, [base]));
  });
}

/** Word order: "how often" words go after "be". */
function order(ts: Term[], out: Issue[]) {
  ts.forEach((a, i) => {
    const be = ts[i + 1];
    const subj = ts[i - 1];
    if (!HOW_OFTEN.has(a.lower) || !be || !subj || pauses(a) || pauses(subj) || !PAST_BE.has(be.lower) && !/^(?:am|is|are)$/.test(be.lower)) return;
    if (!(SUBJECTS.has(subj.lower) || tagged(subj, 'Noun')) || pauses(be)) return;
    const c = ts[i + 2];
    if (!c || !(isAdjective(c.lower) || tagged(c, 'Adjective') || /ing$/.test(c.lower)) || tagged(c, 'Preposition')) return;
    out.push(issue(a.from, be.to, 'word-order', `“${a.word}” goes after “${be.word}”: “${be.word} ${a.word}”.`, [`${be.word} ${a.word}`]));
  });
}

const NOW = /^(?:now|today|still|nowadays|anymore|tonight|currently|these)$/;

/** 6. One story, one time. */
function time(ts: Term[], out: Issue[]) {
  const finite = (t: Term) => tagged(t, 'Verb') && !tagged(t, 'Particle') && !tagged(t, 'Gerund') && !tagged(t, 'Infinitive') && !tagged(t, 'Participle');
  const past = (t: Term) => finite(t) && (tagged(t, 'PastTense') || readVerb(t.lower)?.forms.has('past') === true && !readVerb(t.lower)!.forms.has('present'));
  const present = (t: Term) => finite(t) && tagged(t, 'PresentTense');
  // A clause joined by ", so" or "and then" to one in the past: "She was tired, so she goes to bed."
  ts.forEach((j, i) => {
    if (!/^(?:so|then)$/.test(j.lower) || !ts[i - 1] || !/,/.test(ts[i - 1]!.post) && ts[i - 1]!.lower !== 'and') return;
    const s = ts[i + 1];
    const v = ts[i + 2];
    if (!s || !v || !/^(?:he|she|it)$/.test(s.lower) || pauses(s)) return;
    const reading = readVerb(v.lower);
    if (!reading || !reading.forms.has('present') || reading.forms.has('base') || !/s$/.test(v.lower) || isNoun(v.lower) && !tagged(v, 'Verb')) return;
    const earlier = ts.slice(0, i);
    if (!earlier.some(past) || earlier.some(present) || ts.slice(i).some((t) => NOW.test(t.lower))) return;
    const fix = partsOf(reading.base).past;
    out.push(issue(v.from, v.to, 'tense-shift', `The sentence started in the past, so this is too: “${fix}”.`, [fix]));
  });
  // "picked up the knife and cuts the bread": a second verb for the same subject, slipped into the present.
  ts.forEach((j, i) => {
    const v = ts[i + 1];
    const o = ts[i + 2];
    if (j.lower !== 'and' || !v || !o || pauses(j) || pauses(v)) return;
    if (!(/^(?:the|a|an)$/.test(o.lower) || POSSESSIVES.has(o.lower) || OBJECT_PRONOUNS.has(o.lower)) || !tagged(v, 'Verb')) return;
    const reading = readVerb(v.lower);
    if (!reading || !reading.forms.has('present') || reading.forms.has('base') || !/s$/.test(v.lower)) return;
    // The verb before, in the same stretch, must be in the past and share the subject.
    let past0: Term | null = null;
    for (let k = i - 1; k >= 0 && k >= i - 8; k--) {
      const t = ts[k]!;
      if (/[,;:"“”—–]/.test(t.post) || /^(?:that|who|which|where|when|because|if)$/.test(t.lower)) break;
      if (finite(t)) {
        past0 = past(t) ? t : null;
        break;
      }
    }
    if (!past0 || ts.slice(0, i).some(present) || ts.slice(i).some((t) => NOW.test(t.lower))) return;
    out.push(issue(v.from, v.to, 'tense-shift', `“${past0.word}” is in the past, so this is too: “${partsOf(reading.base).past}”.`, [partsOf(reading.base).past]));
  });
  // "When I was young, I am going": the main clause keeps the time of the "when" clause.
  const [w] = ts;
  if (w && /^(?:when|while|after|before|once|as)$/.test(w.lower)) {
    const comma = ts.findIndex((t) => /,/.test(t.post));
    if (comma > 1 && ts.slice(1, comma + 1).some(past) && !ts.slice(1, comma + 1).some(present)) {
      const s = ts[comma + 1];
      const v = ts[comma + 2];
      if (s && v && SUBJECTS.has(s.lower) && s.lower !== 'it' && s.lower !== 'you' && !/^(?:says|tells|writes|thinks|knows)$/.test(v.lower) && !ts.slice(comma).some((t) => NOW.test(t.lower))) {
        const be = { am: 'was', is: 'was', are: 'were' }[v.lower];
        if (be) out.push(issue(v.from, v.to, 'tense-shift', `The “${w.word}” clause is in the past, so this is too: “${be}”.`, [be]));
        else if (present(v) && /s$/.test(v.lower)) {
          const reading = readVerb(v.lower);
          if (reading?.forms.has('present') && !reading.forms.has('base')) out.push(issue(v.from, v.to, 'tense-shift', `The “${w.word}” clause is in the past, so this is too.`, [partsOf(reading.base).past]));
        }
      }
    }
  }
  // "By the time we arrived, the film already started": the earlier of two past events takes "had".
  if (ts[0]?.lower === 'by' && ts[1]?.lower === 'the' && ts[2]?.lower === 'time') {
    const comma = ts.findIndex((t) => /,/.test(t.post));
    const already = ts.findIndex((t, k) => k > comma && t.lower === 'already');
    const v = ts[already + 1];
    if (comma > 3 && already > comma && v && ts[already - 1]?.lower !== 'had') {
      const reading = readVerb(v.lower);
      if (reading?.forms.has('past')) {
        const fix = `had already ${partsOf(reading.base).participle}`;
        out.push(issue(ts[already]!.from, v.to, 'tense-shift', 'The earlier of two past events takes “had”.', [fix]));
      }
    }
  }
}

/** What Pete's grammar finds in a paragraph's sentences, with the word-pair counts as a guard. */
export function coreIssues(sentences: Sentence[], counts: Counts[]): Issue[] {
  if (!hasDictionary()) return [];
  const pair = pairsOf(counts);
  useNounEvidence((w) => nounish(w, pair));
  const out: Issue[] = [];
  for (const s of sentences) {
    helpers(s.terms, pair, out);
    number(s.terms, pair, counts, out);
    articles(s.terms, pair, counts, out);
    introComma(s.terms, out);
    agreement(s.terms, pair, out);
    frames(s.terms, pair, out);
    owners(s.terms, pair, out);
    describing(s.terms, pair, out);
    order(s.terms, out);
    time(s.terms, out);
  }
  return out;
}
