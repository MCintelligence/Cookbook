import nlp from 'compromise/two';
import { dialogueRanges } from '../editor/dialogue';
import { type Issue } from './check';
import { isPast } from './verbs';

/**
 * Peppery Pete's sentence reader. A small part-of-speech tagger (compromise,
 * which runs offline in the worker) says which words are verbs, nouns,
 * people and names, so Pete can check what a word-by-word rule can't: a
 * sentence with no main clause, an opening phrase that attaches to the wrong
 * subject, and a verb that slips out of the paragraph's tense. Speech is
 * left alone, since people talk in fragments.
 */

// The switches for these checks are listed with Pete's in pete.ts, so the main window never loads the tagger.

interface Term {
  word: string;
  lower: string;
  from: number;
  to: number;
  tags: Set<string>;
  /** The punctuation and spaces after the word. */
  post: string;
}

interface Sentence {
  from: number;
  to: number;
  terms: Term[];
}

function read(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const s of nlp(text).json({ offset: true }) as { terms: { text: string; post: string; tags: string[]; offset: { start: number; length: number } }[] }[]) {
    const terms = s.terms
      .filter((t) => t.offset.length > 0 && /\p{L}/u.test(t.text))
      .map((t) => ({ word: t.text, lower: t.text.toLowerCase().replace(/’/g, "'"), from: t.offset.start, to: t.offset.start + t.offset.length, tags: new Set(t.tags), post: t.post }));
    if (terms.length === 0) continue;
    const last = s.terms.at(-1)!;
    out.push({ from: terms[0]!.from, to: last.offset.start + last.offset.length + last.post.trimEnd().length, terms });
  }
  return out;
}

const issue = (from: number, to: number, rule: string, message: string, suggestions: string[] = []): Issue => ({ from, to, kind: 'grammar', rule, message, suggestions });

const is = (t: Term | undefined, tag: string) => !!t && t.tags.has(tag);
/** A verb that carries a tense of its own: "went", "buys", "was", not "going" or "to go". */
const finite = (t: Term) => is(t, 'Verb') && !is(t, 'Gerund') && !is(t, 'Infinitive') && !is(t, 'Participle');

/** Words that open a clause that can't stand alone. */
const SUBORDINATORS = new Set(['because', 'although', 'though', 'whereas', 'unless', 'since', 'while', 'whenever', 'which', 'if', 'even']);

/**
 * “Because the oven was cold.” A clause that leans on another, standing alone.
 * Only these clear cases: a fiction writer's “Half past nine.” or “Again.” is a choice.
 */
function fragments(sentences: Sentence[], text: string, out: Issue[]) {
  for (const s of sentences) {
    const [first, second] = s.terms;
    if (!first || !SUBORDINATORS.has(first.lower) || s.terms.length < 4 || !/^\p{Lu}/u.test(first.word)) continue;
    if (first.lower === 'even' && second?.lower !== 'though' && second?.lower !== 'if') continue;
    const body = text.slice(s.from, s.to);
    // A comma or dash leads into the main clause; a question or exclamation is speech-like.
    if (/[,;:—–]/.test(body) || !/\.["”’)]*$/.test(body)) continue;
    // “Which was a shame.” and “Because she could.” are fragments too; “If only.” is too short to care.
    // One verb: the leaning clause and nothing else. Two (“While they were speaking the Professor had leant”) is a whole sentence missing a comma.
    const verbs = s.terms.filter((t, k) => (finite(t) || isPast(t.lower)) && !(k > 0 && (finite(s.terms[k - 1]!) || isPast(s.terms[k - 1]!.lower))));
    if (verbs.length !== 1) continue;
    out.push(issue(s.from, s.to, 'fragment', 'This is half a sentence: it says why or when, but not what happened. Join it to the sentence before or after.'));
  }
}

/** Things that can walk, run, smile and think, beyond what the tagger already knows as people. */
const ANIMATE = new Set(
  `man men woman women boy boys girl girls child children kid kids baby babies people person friend friends stranger strangers family mother father
  mum mom dad brother sister aunt uncle cousin wife husband son daughter grandmother grandfather grandma grandpa nan king queen prince princess
  lord lady sir soldier soldiers guard guards crowd team crew dog dogs cat cats horse horses bird birds fox wolf animal creature beast thief
  stranger couple pair group everyone everybody someone somebody nobody anyone anybody i you he she we they who one`.split(/\s+/),
);

/** Openers like “Running down the stairs,”: a verb ending -ing, or “Having baked the bread,”. */
function openerEnd(s: Sentence): number {
  const [first, second] = s.terms;
  if (!first) return -1;
  const ing = /^[a-z]+ing$/.test(first.lower) && (is(first, 'Gerund') || is(first, 'Verb'));
  const having = first.lower === 'having' && !!second && (isPast(second.lower) || is(second, 'PastTense') || is(second, 'Participle'));
  const after = (first.lower === 'after' || first.lower === 'while' || first.lower === 'before') && !!second && /^[a-z]+ing$/.test(second.lower);
  if (!ing && !having && !after) return -1;
  for (let i = 0; i < Math.min(s.terms.length - 1, 12); i++) {
    const t = s.terms[i]!;
    if (/[.!?;:—–"“”]/.test(t.post)) return -1;
    if (t.post.includes(',')) return i + 1;
  }
  return -1;
}

/**
 * “Running down the stairs, the bread fell out of her hands.” The opening
 * phrase belongs to whoever comes after the comma, and bread can't run. Only
 * marked when the subject is plainly a thing: a person, an animal, a name or
 * a pronoun is left alone.
 */
function danglers(sentences: Sentence[], out: Issue[]) {
  for (const s of sentences) {
    const at = openerEnd(s);
    if (at < 0) continue;
    const rest = s.terms.slice(at);
    // The subject: past “the/a/her” and any describing words, the noun before the verb.
    let i = 0;
    if (!is(rest[0], 'Determiner') && !is(rest[0], 'Possessive')) continue;
    i++;
    while (i < rest.length && (is(rest[i], 'Adjective') || (is(rest[i], 'Noun') && is(rest[i + 1], 'Noun')))) i++;
    const head = rest[i];
    // “the smell of bread was”: the subject's own “of …” sits between it and its verb.
    let v = i + 1;
    if (rest[v]?.lower === 'of') for (v++; v < Math.min(rest.length, i + 6) && !finite(rest[v]!); v++);
    const verb = rest[v];
    if (!head || !verb || !is(head, 'Noun') || !finite(verb)) continue;
    if (is(head, 'Person') || is(head, 'Actor') || is(head, 'ProperNoun') || is(head, 'Pronoun') || ANIMATE.has(head.lower) || /^\p{Lu}/u.test(head.word)) continue;
    // A possessive subject (“her hands”) is a body part, which is the person's own: “Reaching up, her hand found the shelf” reads fine to most.
    if (is(rest[0], 'Possessive')) continue;
    const opener = s.terms.slice(0, at);
    out.push(issue(opener[0]!.from, opener.at(-1)!.to, 'dangling', `This opening describes whoever comes next, and that’s “${rest.slice(0, i + 1).map((t) => t.word).join(' ')}”. Say who was doing it.`));
  }
}

/** Verbs that end in -s and are present tense, for the tense check: “buys”, “opens”, “goes”. */
const presentS = (t: Term) => finite(t) && is(t, 'PresentTense') && /[^s]s$|ss?es$|ies$/.test(t.lower) && !is(t, 'Copula') && !is(t, 'Plural');
const pastVerb = (t: Term) => finite(t) && (is(t, 'PastTense') || isPast(t.lower));

/**
 * “He went to the store and buys milk.” Two verbs sharing a subject in one
 * sentence slip from past to present.
 */
function tenseShifts(sentences: Sentence[], out: Issue[]) {
  for (const s of sentences) {
    const ts = s.terms;
    for (let i = 1; i < ts.length; i++) {
      const join = ts[i - 1]!;
      const verb = ts[i]!;
      if (!['and', 'then', 'but', 'or'].includes(join.lower) || !presentS(verb)) continue;
      // “eyes and mouths so wide”, “names of men or ships,”: a list of things, not a second verb.
      const after = ts[i + 1];
      if (!after || /[^\s]/.test(verb.post) || is(ts[i - 2], 'Plural') || ['so', 'of', 'and', 'or', 'as', 'than'].includes(after.lower)) continue;
      if (!(is(after, 'Determiner') || is(after, 'Pronoun') || is(after, 'Possessive') || is(after, 'Noun') || is(after, 'Preposition') || is(after, 'Particle') || ['out', 'up', 'down', 'in', 'back', 'away', 'home', 'off', 'on'].includes(after.lower) || (after.lower === 'to' && !is(ts[i - 2], 'Noun')))) continue;
      // “He says that she went home and sleeps”: a sentence told in the present already.
      if (ts.slice(0, i - 1).some((t) => finite(t) && is(t, 'PresentTense'))) continue;
      // The verb before, in the same stretch: no comma, quote or “that”/“who” in between.
      let k = i - 2;
      let past: Term | null = null;
      for (; k >= 0 && k >= i - 10; k--) {
        const t = ts[k]!;
        if (/[,;:"“”—–]/.test(t.post) || ['that', 'who', 'which', 'where', 'when', 'because', 'if'].includes(t.lower)) break;
        if (finite(t)) {
          past = pastVerb(t) ? t : null;
          break;
        }
      }
      if (!past) continue;
      const fix = pastOf(verb.lower);
      out.push(issue(verb.from, verb.to, 'tense-shift', `“${past.word}” is in the past, so this is too.`, fix ? [fix] : []));
    }
  }
}

const IRREGULAR_PAST: Record<string, string> = {
  buys: 'bought', goes: 'went', comes: 'came', takes: 'took', gives: 'gave', makes: 'made', says: 'said', sees: 'saw', gets: 'got', runs: 'ran',
  sits: 'sat', stands: 'stood', leaves: 'left', finds: 'found', thinks: 'thought', tells: 'told', brings: 'brought', eats: 'ate', drinks: 'drank',
  knows: 'knew', holds: 'held', writes: 'wrote', speaks: 'spoke', falls: 'fell', feels: 'felt', keeps: 'kept', begins: 'began', puts: 'put',
  shuts: 'shut', cuts: 'cut', sets: 'set', has: 'had', does: 'did', is: 'was', sleeps: 'slept', wakes: 'woke', throws: 'threw', catches: 'caught',
  sings: 'sang', swims: 'swam', drives: 'drove', rides: 'rode', hides: 'hid', bites: 'bit', loses: 'lost', meets: 'met', pays: 'paid', sends: 'sent',
  spends: 'spent', builds: 'built', lends: 'lent', bends: 'bent', wins: 'won', hangs: 'hung', leads: 'led', reads: 'read', flies: 'flew',
};
/** The simple past of a present verb ending in -s, when it can be worked out. */
function pastOf(verb: string): string | null {
  if (IRREGULAR_PAST[verb]) return IRREGULAR_PAST[verb]!;
  if (/[^aeiou]ies$/.test(verb)) return `${verb.slice(0, -3)}ied`;
  if (/(?:ch|sh|ss|x|z)es$/.test(verb)) return `${verb.slice(0, -2)}ed`;
  if (/es$/.test(verb) && /[^aeiou][aeiou][^aeiouwxy]e$/.test(verb.slice(0, -1))) return `${verb.slice(0, -1)}d`;
  if (/[^s]s$/.test(verb)) {
    const base = verb.slice(0, -1);
    return /e$/.test(base) ? `${base}d` : `${base}ed`;
  }
  return null;
}

const DAYS = 'monday tuesday wednesday thursday friday saturday sunday january february april july september october november december'.split(' ');
const PEOPLES =
  'english french spanish german italian chinese japanese russian american british irish scottish welsh dutch greek portuguese polish swedish norwegian danish finnish turkish arabic hebrew hindi indian mexican canadian australian african european asian christian christmas easter muslim jewish catholic protestant latin'.split(
    ' ',
  );
const CAPITALISE = new Set([...DAYS, ...PEOPLES]);
/** Short words that end a sentence-looking stretch without ending the sentence. */
const ABBREVIATIONS = /(?:\b(?:mr|mrs|ms|dr|st|prof|sr|jr|vs|etc|e\.g|i\.e|no|vol|fig|approx|inc|ltd|co|esq|rev|col|capt|gen|lt|sgt|bros|ch|p|pp|ft|oz|lb|cf|viz)|\b\p{L})\.\s*$/iu;

/** “On monday”, “they spoke english”, and a sentence starting in lower case. */
function capitals(text: string, sentences: Sentence[], out: Issue[]) {
  for (const s of sentences) {
    for (const t of s.terms) {
      if (CAPITALISE.has(t.lower) && /^\p{Ll}/u.test(t.word) && !/^(?:french|english|turkish|china|polish)\s+(?:windows?|doors?|horn|toast|fries|press|muffin|delight|bread)$/i.test(`${t.lower} ${text.slice(t.to).trimStart().split(/\s/)[0]}`)) {
        const fix = t.word[0]!.toUpperCase() + t.word.slice(1);
        out.push(issue(t.from, t.to, 'capitals', `“${fix}” takes a capital.`, [fix]));
      }
    }
  }
  // A sentence's first word: after a full stop, question or exclamation mark and a space, or the start of the paragraph.
  // After ! or ? a lower-case word is often the same sentence going on (“Oh! not handsome”), so only full stops count.
  for (const m of text.matchAll(/(?:^|(?<=\.\s+))(\p{Ll}[\p{L}'’]*)/gu)) {
    const before = text.slice(0, m.index);
    // “Hi!” she said. ’Tis. e.g. lower. …and then. iPhone.
    if (/[”"’'…]\s*$/.test(before) || ABBREVIATIONS.test(before) || /\p{Lu}/u.test(m[1]!.slice(1)) || /\.\s?\.\s*$/.test(before) || text[m.index + m[1]!.length] === '.') continue;
    const word = m[1]!;
    const fix = word[0]!.toUpperCase() + word.slice(1);
    out.push(issue(m.index, m.index + word.length, 'capitals', `A sentence starts with a capital: “${fix}”.`, [fix]));
  }
}

/** Pasts children and dialects make regular, outside speech: “they brung”, “she throwed”. */
const NONSTANDARD_PAST: Record<string, string> = {
  brung: 'brought', brang: 'brought', bringed: 'brought', throwed: 'threw', knowed: 'knew', growed: 'grew', catched: 'caught', teached: 'taught',
  buyed: 'bought', thinked: 'thought', runned: 'ran', swimmed: 'swam', drinked: 'drank', eated: 'ate', goed: 'went', telled: 'told',
  sayed: 'said', standed: 'stood', sitted: 'sat', hurted: 'hurt', drawed: 'drew', blowed: 'blew', freezed: 'froze', stealed: 'stole',
};

/** Verbs that take a look: “took a peek”, “sneaked another peek”. */
const LOOKING = new Set('take takes took taking taken have has had sneak sneaks sneaked snuck sneaking steal stole stolen stealing get got getting'.split(' '));
const PRONOUN_OBJECTS = new Set(['him', 'her', 'them', 'me', 'you', 'us']);
const EVERY = new Set(['everyone', 'everybody', 'everything', 'all', 'anyone', 'anybody', 'nobody', 'nothing', 'none']);

/**
 * Mix-ups the look-alike counts can't settle, read from the words around them:
 * “Who’s coat”, “took a peak”, “complemented him on”, “everyone accept him”,
 * “the principle of the school”, and two words to avoid.
 */
function mixups(sentences: Sentence[], out: Issue[]) {
  for (const s of sentences) {
    const ts = s.terms;
    ts.forEach((t, i) => {
      const next = ts[i + 1];
      const prev = ts[i - 1];
      const fixed = (fix: string) => (/^\p{Lu}/u.test(t.word) ? fix[0]!.toUpperCase() + fix.slice(1) : fix);
      if (t.lower === "who's" && next && is(next, 'Noun') && !['there', 'here', 'now', 'then', 'that', 'this', 'it', 'next', 'home'].includes(next.lower) && !is(next, 'Pronoun') && !is(next, 'ProperNoun') && !is(next, 'Gerund') && !/ing$/.test(next.lower) && !is(next, 'Adverb')) {
        out.push(issue(t.from, t.to, 'word-mixup', '“Who’s” is “who is”. For whose coat it is, it’s “whose”.', [fixed('whose')]));
      } else if (/^peaks?$/.test(t.lower) && ts.slice(Math.max(0, i - 4), i).some((x) => LOOKING.has(x.lower)) && (is(prev, 'Determiner') || is(prev, 'Adjective'))) {
        out.push(issue(t.from, t.to, 'word-mixup', 'A quick look is a “peek”; a “peak” is the top of something.', [t.lower === 'peaks' ? 'peeks' : 'peek']));
      } else if (/^peak(?:ed|ing|s)$/.test(t.lower) && (is(prev, 'Pronoun') || is(prev, 'ProperNoun')) && /^(?:through|into|inside|over|around|round|out|in|at|under|behind)$/.test(next?.lower ?? '') && !/^\d/.test(ts[i + 2]?.word ?? '')) {
        out.push(issue(t.from, t.to, 'word-mixup', 'To look quickly is to “peek”; to “peak” is to reach the top.', [t.lower.replace('peak', 'peek')]));
      } else if (/^complement(?:s|ed|ing)?$/.test(t.lower) && next && PRONOUN_OBJECTS.has(next.lower) && ts[i + 2]?.lower === 'on') {
        out.push(issue(t.from, t.to, 'word-mixup', 'Praise is a “compliment”; a “complement” completes something.', [t.word.replace(/complement/i, (m) => (m[0] === 'C' ? 'Compliment' : 'compliment'))]));
      } else if (t.lower === 'accept' && prev && EVERY.has(prev.lower) && next && (PRONOUN_OBJECTS.has(next.lower) || is(next, 'Determiner') || is(next, 'ProperNoun') || next.lower === 'for')) {
        out.push(issue(t.from, t.to, 'word-mixup', 'To leave someone out is “except”; “accept” is to take.', ['except']));
      } else if (t.lower === 'principle' && ((next?.lower === 'of' && /^(?:the|this|that|our|my|his|her|their)$/.test(ts[i + 2]?.lower ?? '') && /^(?:school|college|academy|university)$/.test(ts[i + 3]?.lower ?? '')) || (prev && /^(?:school|head|assistant|vice)$/.test(prev.lower)) || next?.lower === "principle's")) {
        out.push(issue(t.from, t.to, 'word-mixup', 'The head of a school is the “principal”; a “principle” is a rule.', [fixed('principal')]));
      } else if (NONSTANDARD_PAST[t.lower] && (is(prev, 'Pronoun') || is(prev, 'Noun') || is(prev, 'ProperNoun') || prev?.lower === 'had' || prev?.lower === 'have' || prev?.lower === 'has')) {
        out.push(issue(t.from, t.to, 'verb-form', `The past of this verb is “${NONSTANDARD_PAST[t.lower]}”.`, [NONSTANDARD_PAST[t.lower]!]));
      } else if (t.lower === 'irregardless') {
        out.push(issue(t.from, t.to, 'usage', '“Irregardless” is a muddle of “regardless” and “irrespective”.', [fixed('regardless')]));
      } else if (t.lower === 'alright') {
        out.push(issue(t.from, t.to, 'usage', 'Most editors still want “all right” outside speech.', [fixed('all right')]));
      }
    });
  }
}

/** What Pete reads from whole sentences in one paragraph. */
export function parsedIssues(text: string): Issue[] {
  if (!/\p{L}/u.test(text)) return [];
  const speech = dialogueRanges(text);
  const inSpeech = (i: Issue) => speech.some(([a, b]) => i.from < b && i.to > a);
  const sentences = read(text);
  const out: Issue[] = [];
  fragments(sentences, text, out);
  danglers(sentences, out);
  tenseShifts(sentences, out);
  capitals(text, sentences, out);
  mixups(sentences, out);
  return out.filter((i) => !inSpeech(i) || i.rule === 'capitals').sort((a, b) => a.from - b.from);
}
