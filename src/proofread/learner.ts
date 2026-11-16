import { type Issue } from './check';
import { isPast } from './verbs';

/**
 * Peppery Pete's checks for the mistakes the published grammar-checker studies
 * test most: one or many (two book, much books), articles (she is doctor, a
 * bread), fixed prepositions (depends of, afraid from), word order (where you
 * are going?, a car red), tenses that clash with a time word (yesterday we
 * have visited), and a few word forms. They are the mistakes of writers
 * working in a second language, and of anyone typing fast.
 *
 * Every rule and list here is Cookbook's own. Each one matches a narrow
 * pattern and is tuned against whole novels so good prose stays clean.
 */

export const LEARNER_RULES: { id: string; label: string }[] = [
  {
    id: 'noun-number',
    label: 'One or many (two book, much books, this apples)',
  },
  {
    id: 'article',
    label: 'Articles (she is doctor, a bread, plays the football)',
  },
  { id: 'preposition', label: 'Fixed prepositions (depends of, afraid from)' },
  { id: 'word-order', label: 'Word order (where you are going?, a car red)' },
  {
    id: 'tense-time',
    label: 'Tenses that clash with a time word (yesterday we have visited)',
  },
  { id: 'word-form', label: 'Word forms (need to decision, enjoys to cook)' },
];

export type IsWord = (word: string) => boolean;

const issue = (from: number, to: number, rule: string, message: string, suggestions: string[]): Issue => ({ from, to, kind: 'grammar', rule, message, suggestions });
const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);
const fix = (text: string, from: number, to: number, rule: string, message: string, replacement: string) => issue(from, to, rule, message, [matchCase(text.slice(from, to), replacement)]);

const CLAUSE_START = '(?:^|(?<=[.!?…;:]["”’]?\\s+)|(?<=[“"(—–]\\s*)|(?<=,\\s+(?:and|but|so|because|when|while|if|then)\\s+)|(?<=\\b(?:and|but|so|because|when|while|if|then)\\s+))';
const PRONOUN_SUBJECT = 'I|you|he|she|it|we|they';
const DETS = 'the|my|your|his|her|its|our|their|this|that|a|an';

// ---------- One or many ----------

const IRREGULAR_PLURAL: Record<string, string> = {
  child: 'children',
  person: 'people',
  tooth: 'teeth',
  foot: 'feet',
  man: 'men',
  woman: 'women',
  mouse: 'mice',
  goose: 'geese',
  knife: 'knives',
  wife: 'wives',
  life: 'lives',
  leaf: 'leaves',
  half: 'halves',
  loaf: 'loaves',
  wolf: 'wolves',
  shelf: 'shelves',
  thief: 'thieves',
};
/** Words that stay the same for many, or count as amounts, or are describing words more often than things. */
const NOT_COUNTED = new Set(
  'people children men women teeth feet mice geese police cattle staff sheep fish deer hundred thousand million billion dozen score percent more less other others else same such own together alike apart again too either ago present absent involved concerned assembled gathered left remaining mentioned above below here there who whom which whose what that this these those of each all both several many few different separate various numerous long short little times way kind sort type part much enough alone apart once twice sides'.split(
    ' ',
  ),
);
const COUNTERS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|several|many|few|these|those|various|numerous';
const NUMBER_THEN = new RegExp(`\\b(${COUNTERS}|(?:both|many|several|few) of (?:${DETS}|these|those))\\s+(\\p{Ll}+)\\b`, 'giu');
/** What can follow a noun that ends a phrase: an end mark, a preposition, a joining word, a verb we know. */
const PHRASE_END =
  /^\s*(?:$|[.,;:!?…)"”—–]|(?:in|on|at|for|with|from|to|into|of|by|under|near|behind|and|or|but|that|who|which|were|are|was|is|have|has|had|came|went|live|lived|passed|left|stood|sat|ran|said|yesterday|today|tonight|tomorrow|again|now|later|here|there|ago)\b)/u;

/** Whether a word is most likely a describing word: it has an -ly form and a comparative or an adjective ending ("bright", "silent", but not "friend"). */
function describes(word: string, isWord: IsWord): boolean {
  const stem = word.endsWith('e') ? word.slice(0, -1) : word.replace(/y$/, 'i');
  return (isWord(`${word}ly`) || isWord(`${stem}ly`)) && (isWord(`${stem}er`) || isWord(`${stem}est`) || /(?:ent|ant|ous|ful|ive|al|ic|ish|le|age|ime)$/.test(word));
}

function pluralOf(word: string, isWord: IsWord): string | null {
  if (IRREGULAR_PLURAL[word]) return IRREGULAR_PLURAL[word]!;
  const tries = /(?:s|x|z|ch|sh)$/.test(word) ? [`${word}es`] : /[^aeiou]y$/.test(word) ? [`${word.slice(0, -1)}ies`] : [`${word}s`];
  return tries.find(isWord) ?? null;
}

const MUCH_PLURAL = /\b(much)\s+(\p{Ll}{3,}s)\b(?!\s+as\b)/giu;
// Not "that": "see that flowers are placed" is a joining word.
const THIS_PLURAL = /\b(this)\s+(\p{Ll}{3,}s)\s+(?=(?:are|were|have|look|taste|seem|were)\b)/giu;
/** Words that are never the noun of a phrase. */
const CLOSED = new Set(
  'are is was were be been am him her he she it they them we us me i you back down up in out on off behind inside outside over under before after above below that this there here then than when where who what which and or but not no so very too also just only one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand first second third last next will would can could shall should may might must do does did had has have'.split(
    ' ',
  ),
);
const MASS_PLURALS = new Set('news means physics mathematics politics economics series species thanks clothes glasses scissors trousers pants riches odds'.split(' '));

function nounNumber(text: string, isWord: IsWord, out: Issue[]) {
  for (const m of text.matchAll(NUMBER_THEN)) {
    const word = m[2]!;
    // "The two stand", "a numerous medley": "the two" are people, and "a numerous" describes one thing.
    if (/\b(?:the|a|an)\s*$/iu.test(text.slice(0, m.index))) continue;
    if (!/^\p{Ll}/u.test(word) || CLOSED.has(word) || isPast(word) || describes(word, isWord)) continue;
    // "both horse and rider": "both … and" names two things, one of each.
    if (/^both/i.test(m[1]!) && /^\s+and\b/.test(text.slice(m.index + m[0].length))) continue;
    if (word.endsWith('s') || NOT_COUNTED.has(word) || /(?:ed|ing|ish|ous|ful|ive|est)$/.test(word) || !isWord(word)) continue;
    const after = text.slice(m.index + m[0].length);
    if (!PHRASE_END.test(after)) continue;
    // "many wise and true sermons": two describing words. "two cat and a dog" is two things.
    if (/^\s+and\s+(?!(?:a|an|the|my|his|her|their|our|your|one|two|three|some)\b)/u.test(after)) continue;
    // "two of the best", "these here": only a word with a plural of its own is a noun here.
    const plural = pluralOf(word, isWord);
    if (!plural) continue;
    const at = m.index + m[0].length - word.length;
    out.push(issue(at, at + word.length, 'noun-number', `After “${m[1]!.toLowerCase()}”, it’s more than one: “${plural}”.`, [plural]));
  }
  for (const m of text.matchAll(MUCH_PLURAL)) {
    const noun = m[2]!.toLowerCase();
    if (MASS_PLURALS.has(noun) || CLOSED.has(noun) || !isWord(noun.slice(0, -1)) || /(?:ss|us|is)$/.test(noun)) continue;
    out.push(fix(text, m.index, m.index + 4, 'noun-number', `“Much” is for amounts; for things you can count, it’s “many”.`, 'many'));
  }
  for (const m of text.matchAll(THIS_PLURAL)) {
    const noun = m[2]!.toLowerCase();
    if (MASS_PLURALS.has(noun) || !isWord(noun.slice(0, -1)) || /(?:ss|us|is)$/.test(noun)) continue;
    const det = m[1]!;
    out.push(
      fix(
        text,
        m.index,
        m.index + det.length,
        'noun-number',
        `“${noun}” is more than one, so it’s “${det.toLowerCase() === 'this' ? 'these' : 'those'}”.`,
        det.toLowerCase() === 'this' ? 'these' : 'those',
      ),
    );
  }
}

// ---------- Articles ----------

const JOBS =
  'doctor|teacher|nurse|cook|chef|lawyer|student|engineer|baker|farmer|writer|artist|actor|singer|driver|pilot|waiter|waitress|soldier|scientist|journalist|dentist|mechanic|plumber|painter|carpenter|architect|accountant|programmer|librarian|banker|butcher|vet|surgeon|secretary|cashier|electrician|firefighter|police officer';
const BARE_JOB = new RegExp(
  `\\b(?:I am|I'm|I’m|(?:he|she|it) (?:is|was)|(?:he|she)'s|(?:he|she)’s|I was|my \\p{L}+ is|my \\p{L}+ was)\\s+(${JOBS})\\b(?=\\s*(?:[.,;!?]|$|\\s+(?:in|at|for|and|but|now|too)\\b))`,
  'giu',
);
const SPORTS = 'football|soccer|tennis|golf|basketball|baseball|chess|cricket|rugby|hockey|volleyball|badminton|poker|netball';
const THE_SPORT = new RegExp(`\\b(?:play|plays|played|playing)\\s+(the)\\s+(?=(?:${SPORTS})\\b)`, 'giu');
const LANGUAGES = 'English|French|Spanish|German|Italian|Portuguese|Chinese|Japanese|Russian|Arabic|Dutch|Greek|Korean|Hindi|Polish|Swedish|Turkish|Welsh|Latin';
const THE_LANGUAGE = new RegExp(
  `\\b(?:speak|speaks|spoke|speaking|learn|learns|learned|learnt|learning|study|studies|studied|studying|teach|teaches|taught|teaching)\\s+(the\\s+)(?=(?:${LANGUAGES})(?:\\s*(?:[.,;!?]|$)|\\s+(?:fluently|well|badly|perfectly|now|at|in|with|and|very|every|a little|too)\\b))`,
  'gu',
);
// Not cheese, soup or cake: "a cheese" is a whole one.
const MASS = 'bread|water|advice|information|furniture|luggage|baggage|homework|money|milk|rice|music|news|weather|equipment|traffic|research';
const A_MASS = new RegExp(`\\b(an?)\\s+(?=(?:${MASS})(?:\\s*(?:[.,;!?]|$)|\\s+(?:and|or|for|with|from|in|on|at|to|that|which|was|is|every|today|yesterday)\\b))`, 'giu');
const NOT_SOME =
  /\b(?:there|there's|there’s)\s+(?:isn't|isn’t|wasn't|wasn’t|is not|was not)\s+(some)\s+(?=(?:milk|water|bread|money|food|tea|coffee|sugar|salt|butter|flour|time|room|space|news|help|wine|beer|meat|rice)\b)/giu;
const TO_THE_BED = /\b(?:go|goes|went|going|gone)\s+to\s+(the\s+)(?=bed\s+(?:early|late|now|at\s+once|at\s+\d)\b)/giu;

function articles(text: string, out: Issue[]) {
  for (const m of text.matchAll(BARE_JOB)) {
    const job = m[1]!;
    const at = m.index + m[0].length - job.length;
    out.push(issue(at, at + job.length, 'article', `A job after “is” or “am” takes “a” or “an”: “${/^[aeiou]/i.test(job) ? 'an' : 'a'} ${job}”.`, [`${/^[aeiou]/i.test(job) ? 'an' : 'a'} ${job}`]));
  }
  for (const m of text.matchAll(THE_SPORT)) {
    const at = m.index + m[0].lastIndexOf(m[1]!);
    out.push(issue(at, at + 4, 'article', 'Games and sports go without “the”: “plays football”.', ['']));
  }
  for (const m of text.matchAll(THE_LANGUAGE)) {
    const at = m.index + m[0].lastIndexOf(m[1]!);
    out.push(issue(at, at + m[1]!.length, 'article', 'A language goes without “the”: “speaks English”.', ['']));
  }
  for (const m of text.matchAll(A_MASS)) {
    const art = m[1]!;
    const noun = /^\s*(\p{L}+)/u.exec(text.slice(m.index + m[0].length))![1]!;
    out.push(issue(m.index, m.index + art.length, 'article', `“${noun}” can’t be counted, so it takes “some”, not “${art.toLowerCase()}”.`, [matchCase(art, 'some')]));
  }
  for (const m of text.matchAll(NOT_SOME)) {
    const at = m.index + m[0].length - 4;
    out.push(fix(text, at, at + 4, 'article', 'After “not”, it’s “any”: “there isn’t any milk”.', 'any'));
  }
  for (const m of text.matchAll(TO_THE_BED)) {
    const at = m.index + m[0].lastIndexOf(m[1]!);
    out.push(issue(at, at + m[1]!.length, 'article', 'Going to sleep is “to bed”, without “the”.', ['']));
  }
}

// ---------- Prepositions ----------

/** Words that always take the same preposition, and the wrong ones writers reach for. */
const COLLOCATIONS: [RegExp, string, string][] = [
  [/\b(?:depend|depends|depended|depending|dependent)\s+(of|from|to)\b/giu, 'on', '“depend on”'],
  [/\b(?:afraid|scared|terrified)\s+(from)\s+/giu, 'of', '“afraid of”'],
  [/\b(?:responsible)\s+(of|about)\b/giu, 'for', '“responsible for”'],
  [/\b(?:interested)\s+(about|on)\s+(?!\p{L}+ing\b)(?=\p{L})/giu, 'in', '“interested in”'],
  [
    /\b(?:good|better|best|bad|brilliant|excellent)\s+(in)\s+(?=(?:math|maths|mathematics|science|sports|sport|languages|english|french|spanish|german|history|geography|chemistry|physics|biology|art|music|tennis|football|chess|cooking|drawing|writing|singing|dancing|swimming)\b)/giu,
    'at',
    '“good at”',
  ],
  [/\b(?:married)\s+(with)\s+(?=(?:a|an|the|my|his|her|their|your|our)\s+\p{L}+\s*(?:[.,;!?]|$|\s+(?:who|in|last|for|and)\b))/giu, 'to', '“married to”'],
  [/\b(in)\s+(?=(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b(?!['’]s))/gu, 'on', '“on Monday”'],
  [
    /\b(?:have|has|had|I've|I’ve|we've|we’ve|they've|they’ve|you've|you’ve)\s+(?:\p{L}+\s+){1,3}?(since)\s+(?=(?:two|three|four|five|six|seven|eight|nine|ten|\d+|a few|many|several)\s+(?:years|months|weeks|days|hours|minutes)\b)/giu,
    'for',
    '“for five years” (“since” needs a starting point: “since 2019”)',
  ],
  [/\b(?:discuss|discussed|discusses|discussing)\s+(about)\s+/giu, '', '“discuss” without “about”'],
  [/\b(?:emphasise|emphasised|emphasize|emphasized|emphasises|emphasizes)\s+(on)\s+(?=the\b)/giu, '', 'no “on” after it'],
  [/\b(?:I|you|he|she|we|they|then|had|have|has|never)\s+visited\s+(to)\s+(?=(?:the|a|my|his|her|their|our|your)\b)/giu, '', 'no “to” after “visit”'],
  [
    /\b(?:listen|listens|listened|listening)\s+(?=(?:the|my|his|her|their|our|your)\s+(?!(?:whole|entire|rest|next|same|first|last|while|moment|minute|hour|night|day|morning|evening)\b))/giu,
    'to',
    '“listen to”',
  ],
  [/\b(?:depend|depends|depended)\s+(?=(?:my|his|her|their|our|your)\s)/giu, 'on', '“depend on”'],
  [/\b(?:wait|waits|waited|waiting)\s+(?=the\s+(?:bus|train|taxi|tram|plane|ferry|coach|postman|results?)\b)/giu, 'for', '“wait for”'],
];

function prepositions(text: string, out: Issue[]) {
  for (const [re, right, phrase] of COLLOCATIONS) {
    for (const m of text.matchAll(re)) {
      if (m[1] === undefined) {
        // A missing preposition: underline the verb and add it.
        const verb = m[0].trim();
        out.push(issue(m.index, m.index + verb.length, 'preposition', `It’s ${phrase}.`, [`${verb} ${right}`]));
        continue;
      }
      const from = m.index + m[0].lastIndexOf(m[1]);
      if (right === '') out.push(issue(from - 1, from + m[1].length, 'preposition', `It’s ${phrase}.`, ['']));
      else out.push(issue(from, from + m[1].length, 'preposition', `It’s ${phrase}.`, [matchCase(m[1], right)]));
    }
  }
}

// ---------- Word order ----------

const WH_NO_INVERSION = new RegExp(
  `${CLAUSE_START}((?:Where|Why|What|When|How(?: much| many| long| often| old| far)?)\\s+(?:${PRONOUN_SUBJECT})\\s+(?:am|is|are|was|were|\\p{L}+s|\\p{L}+ed|did|do|can|will|have|has|did|went|saw|came|took|made)\\b)[^.!?“”"]*\\?`,
  'gu',
);
const ASKED_EMBED =
  /\b(?:know|knows|knew|tell me|told me|wonder|wonders|wondered|ask|asked|asks|asked me|asked him|asked her|remember|forgot|forget|sure|understand|explain|show me|guess)\s+(?:where|what|when|why|how|who|what time|which way|how much|how many|how long|how far|how old)\s+((?:is|are|was|were|does|do|did|can|could|will|would|has|have)\s+(?:the|a|an|my|your|his|her|their|our|this|that|it|he|she|they|we|you|I)\b(?:\s+\p{L}+)?)(?=[^.!?]*[.?])/giu;
const COLOUR_ADJ =
  'red|blue|green|yellow|black|white|brown|pink|purple|orange|grey|gray|big|small|little|large|tall|short|old|new|young|beautiful|pretty|ugly|expensive|cheap|nice|lovely|good|bad|long|fast|slow|hot|cold|warm|huge|tiny|clean|dirty|empty|full|famous|important|interesting|delicious';
const ADJ_AFTER = new RegExp(
  `\\b(?:is|was|are|were|have|has|had|bought|buy|buys|saw|see|want|wanted|need|needed|own|owns|owned|found)\\s+(?:a|an)\\s+((\\p{Ll}+)\\s+(${COLOUR_ADJ}))(?=\\s*[.,;!?])`,
  'giu',
);
/** A verb, then "very much" or "often" before its object: "I like very much chocolate". */
const ADVERB_BEFORE_OBJECT = new RegExp(
  `\\b(like|likes|liked|love|loves|loved|speak|speaks|spoke|visit|visits|visited|see|sees|saw|play|plays|played|eat|eats|ate|drink|drinks|drank|watch|watches|watched|enjoy|enjoys|enjoyed|want|wants|wanted|cook|cooks|cooked)\\s+(very much|very well|often|always|usually|sometimes|yesterday|every day)\\s+(?=(?:the|my|your|his|her|their|our|this|that|these|those|a|an|${LANGUAGES}|chocolate|music|coffee|tea|football)\\b)`,
  'gu',
);
const NOT_LEXICAL =
  /^(?:am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|shall|should|can|could|may|might|must|seem|seems|seemed|become|became|becomes|remain|remains|remained|and|or|but|not|i|you|he|she|it|we|they|which|who|that|as|than|so|how|almost|nearly|it's|there|here)$/u;

function wordOrder(text: string, isWord: IsWord, out: Issue[]) {
  for (const m of text.matchAll(WH_NO_INVERSION)) {
    const phrase = m[1]!;
    out.push(issue(m.index, m.index + phrase.length, 'word-order', 'In a question, the verb comes before the subject: “Where are you going?”', []));
  }
  for (const m of text.matchAll(ASKED_EMBED)) {
    const part = m[1]!;
    // "asked what was the matter", "knows who was the murderer": "what" and "who" can be the subject.
    if (
      /\b(?:what|who)\s+(?:is|are|was|were)\s+[^,]*$/iu.test(m[0].slice(0, m[0].length - part.length + 12)) &&
      /^(?:is|are|was|were)\b/i.test(part) &&
      /\b(?:what|who)\s+$/iu.test(m[0].slice(0, m[0].length - part.length))
    )
      continue;
    const at = m.index + m[0].length - part.length;
    const ws = part.split(/\s+/);
    // "where is the station" → "where the station is"; "what does he want" → "what he wants" is left as a note.
    const suggestion = /^(?:is|are|was|were)$/i.test(ws[0]!) && ws.length >= 3 ? `${ws.slice(1).join(' ')} ${ws[0]}` : undefined;
    out.push(issue(at, at + part.length, 'reported-question', 'A question inside a sentence keeps statement order: “where the station was”.', suggestion ? [suggestion] : []));
  }
  for (const m of text.matchAll(ADJ_AFTER)) {
    const [, phrase, noun, adj] = m;
    // "a year old", "a foot long": a measure, not a describing word out of place.
    if (/^(?:old|long|tall|high|wide|deep|thick|young)$/.test(adj!)) continue;
    if (NOT_LEXICAL.test(noun!) || /(?:ly|ing)$/.test(noun!) || new RegExp(`^(?:${COLOUR_ADJ})$`).test(noun!) || describes(noun!, isWord)) continue;
    const at = m.index + m[0].length - phrase!.length;
    out.push(issue(at, at + phrase!.length, 'word-order', 'A describing word goes before its noun: “a red car”.', [`${adj} ${noun}`]));
  }
  for (const m of text.matchAll(ADVERB_BEFORE_OBJECT)) {
    const verb = m[1]!;
    if (NOT_LEXICAL.test(verb) || /(?:ly)$/.test(verb)) continue;
    const adverb = m[2]!;
    const at = m.index + m[0].indexOf(adverb, verb.length);
    out.push(issue(at, at + adverb.length, 'word-order', `“${adverb}” doesn’t go between a verb and what it acts on. Put it after: “likes chocolate ${adverb}”, or before the verb.`, []));
  }
}

// ---------- Time words ----------

const FINISHED_TIME =
  /\b(?:yesterday(?!['’]s)|(?<!\bthe\s)last (?:night|week|month|year|summer|winter|spring|autumn|fall|weekend|time|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?!['’]s)|(?:a|two|three|four|five|six|ten|\d+|many|few|several) (?:minutes|hours|days|weeks|months|years) ago|in (?:1[89]\d\d|20\d\d))\b/iu;
const PERFECT =
  /\b(have|has|'ve|’ve)\s+(\p{L}+(?:ed|en|wn|ne)|been|seen|done|gone|made|had|got|found|bought|brought|thought|taught|left|met|felt|kept|lost|sent|spent|told|sold|won|said|heard|built|read|put|set|cut)\b/giu;
const PROGRESSIVE = /\b(am|is|are|'m|’m|'s|’s|'re|’re)\s+(\p{L}+ing)\b/giu;

/** Tenses that clash with a time word in the same sentence. */
function tenseTime(text: string, out: Issue[]) {
  for (const s of text.matchAll(/[^.!?…]+[.!?…]?/gu)) {
    const sentence = s[0];
    const base = s.index;
    if (/["“”]/.test(sentence)) continue;
    if (FINISHED_TIME.test(sentence) && !/\bsince\b|\bever\b|\bnever\b/iu.test(sentence)) {
      const when = FINISHED_TIME.exec(sentence)!.index;
      for (const m of sentence.matchAll(PERFECT)) {
        // Only in the same clause as the time word.
        if (/[,;:—–"“”()]|--/u.test(sentence.slice(Math.min(when, m.index), Math.max(when, m.index)))) continue;
        // "might have made money last week", "would not have been here": a modal looks back from elsewhere.
        if (/\b(?:would|could|should|might|must|may|will|shall|to|not|n't|n’t)\s*$/iu.test(sentence.slice(0, m.index))) continue;
        const at = base + m.index;
        out.push(issue(at, at + m[0].length, 'tense-time', 'With a finished time such as “yesterday” or “in 2019”, use the simple past: “visited”, not “have visited”.', []));
      }
      if (/^\s*(?:Yesterday|Last (?:night|week|month|year))\b/u.test(sentence)) {
        for (const m of sentence.matchAll(PROGRESSIVE)) {
          const at = base + m.index;
          const be = m[1]!.replace(/['’]/, '');
          out.push(issue(at, at + m[1]!.length, 'tense-time', 'This happened in the past, so it’s “was” or “were”.', [/^(?:are|re)$/.test(be) ? 'were' : 'was']));
        }
      }
    }
    // "She is working here since March": "since" and "for five years" reach back, so the verb needs "have".
    const since =
      /\b(?:since\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Christmas|Easter|\d{4}\b|last\s+(?:year|week|month|summer|winter)\b|childhood\b|I was a child\b)|for\s+(?:two|three|four|five|six|seven|eight|nine|ten|\d+|many|several)\s+(?:years|months|weeks|days|hours))/u.exec(
        sentence,
      );
    if (since) {
      for (const m of sentence.slice(0, since.index).matchAll(/\b(am|is|are)\s+(\p{L}+ing)\b/gu)) {
        const at = base + m.index;
        out.push(
          issue(at, at + m[0].length, 'tense-time', '“Since” and “for” reach back from now, so the verb takes “have”: “has worked here since March”.', [
            `${m[1] === 'is' ? 'has' : 'have'} been ${m[2]}`,
          ]),
        );
      }
    }
    const known = /\b(know|knows)\s+(?:him|her|them|you|me|us|it|\p{Lu}\p{Ll}+)\s+for\s+(?:two|three|four|five|six|seven|eight|nine|ten|\d+|many|several|a few)\s+(?:years|months|weeks)\b/u.exec(
      sentence,
    );
    if (known) {
      const at = base + known.index;
      out.push(issue(at, at + known[1]!.length, 'tense-time', '“For ten years” reaches back from now, so it’s “have known”.', [known[1] === 'knows' ? 'has known' : 'have known']));
    }
    if (/^\s*Tomorrow\b/u.test(sentence)) {
      const m = /\b(?:I|you|he|she|we|they|it)\s+(\p{L}+ed|went|came|saw|took|made|gave|met|left|visited)\b/u.exec(sentence);
      if (m) {
        const at = base + m.index + m[0].length - m[1]!.length;
        out.push(issue(at, at + m[1]!.length, 'tense-time', '“Tomorrow” is still to come, so the verb takes “will”.', []));
      }
    }
  }
}

// ---------- Word forms ----------

const TO_NOUN = /\b(?:need|needs|needed|want|wants|wanted|try|tries|tried|going|able|decided|decide|hope|hoped|plan|planned|have|has|had)\s+to\s+(\p{Ll}+(?:tion|sion|ness|ity|ment))\b/gu;
/** Nouns in -tion and -ment that are verbs too: "need to mention", "try to comment". */
const VERB_TOO = new Set(
  'mention question function position station ration auction sanction caution condition fashion section petition motion partition comment document experiment implement supplement complement compliment ferment torment augment segment cement lament vision envision commission requisition audition proposition'.split(
    ' ',
  ),
);
const VERB_TO_ING = /\b(?:I|[Yy]ou|[Hh]e|[Ss]he|[Ww]e|[Tt]hey|to|not|n't|n’t)\s+(enjoy|enjoys|enjoyed|avoid|avoids|avoided|finish|finishes|finished|postpone|postponed)\s+(to\s+([a-z]+))\b(?<!s)/gu;
const MAKE_TO = /\b(?:make|makes|made|making|let|lets|letting)\s+(?:me|him|her|us|them|you)\s+(to\s+)(?=\p{Ll}+)/giu;
// Not after "what I could", "all he could", "as much as we can": those end there, and the "to" starts a purpose.
const MODAL_TO =
  /(?<!\b(?:what|all|whatever|everything|anything|as|than|best)\s+)\b(?:I|you|he|she|we|they)\s+(?:can|could|must|should|might|may|will|would)\s+(to\s+)(?=[a-z]+\b)(?!(?:bed|the|my|his|her|their|our|your|a|an|it|work|church|school|town|sea|war)\b)/gu;
const VERY_ADJ =
  /\b(?:drove|drive|drives|driving|ran|run|runs|running|walked|walk|walks|spoke|speak|speaks|worked|work|works|moved|move|moves|listened|listen|wrote|write|writes|sang|sing|sings|played|play|plays|cooked|cook|cooks)\s+(?:very|so|too|really|quite)\s+(quick|quiet|careful|slow|bad|loud|soft|polite|rude|nervous|angry|happy|sad|calm|beautiful|clear|gentle|easy|good)\b(?=\s*(?:[.,;!?]|$|\s+(?:to|at|for|in|with|and|but|as)\b))/giu;
const LY: Record<string, string> = {
  quick: 'quickly',
  quiet: 'quietly',
  careful: 'carefully',
  slow: 'slowly',
  bad: 'badly',
  loud: 'loudly',
  soft: 'softly',
  polite: 'politely',
  rude: 'rudely',
  nervous: 'nervously',
  angry: 'angrily',
  happy: 'happily',
  sad: 'sadly',
  calm: 'calmly',
  beautiful: 'beautifully',
  clear: 'clearly',
  gentle: 'gently',
  easy: 'easily',
  good: 'well',
};

function ingOf(verb: string, isWord: IsWord): string {
  const tries = [`${verb}ing`, `${verb.replace(/e$/, '')}ing`, `${verb}${verb.slice(-1)}ing`];
  return tries.find(isWord) ?? `${verb}ing`;
}

function wordForms(text: string, isWord: IsWord, out: Issue[]) {
  for (const m of text.matchAll(TO_NOUN)) {
    const noun = m[1]!;
    if (VERB_TOO.has(noun) || noun.length < 7) continue;
    const at = m.index + m[0].length - noun.length;
    out.push(issue(at, at + noun.length, 'word-form', `After “to”, use a verb, not the noun “${noun}”.`, []));
  }
  for (const m of text.matchAll(VERB_TO_ING)) {
    const [, verb, phrase, base] = m;
    if (/s$/.test(base!)) continue;
    if (/^(?:the|a|an|be|my|his|her|their|our|your|me|him|them|us|it)$/i.test(base!)) continue;
    const at = m.index + m[0].lastIndexOf(phrase!);
    out.push(issue(at, at + phrase!.length, 'word-form', `After “${verb}”, the verb ends in -ing: “${verb} ${ingOf(base!, isWord)}”.`, [ingOf(base!, isWord)]));
  }
  for (const m of [...text.matchAll(MAKE_TO), ...text.matchAll(MODAL_TO)]) {
    const at = m.index + m[0].length - m[1]!.length;
    out.push(issue(at, at + m[1]!.length - 1, 'word-form', 'No “to” here: “made me wait”, “can swim”.', ['']));
  }
  for (const m of text.matchAll(VERY_ADJ)) {
    const word = m[1]!;
    const at = m.index + m[0].length - word.length;
    out.push(issue(at, at + word.length, 'word-form', `For how something is done, use “${LY[word.toLowerCase()]}”.`, [matchCase(word, LY[word.toLowerCase()]!)]));
  }
}

// ---------- Agreement with a plain subject ----------

const PLAIN_VERBS =
  'live|work|like|want|need|know|think|come|go|make|take|say|see|eat|cook|play|love|hate|seem|feel|run|walk|talk|sing|write|sleep|stay|wait|help|try|use|keep|leave|give|tell|call|ask|bring|buy|sell|speak|teach|drive|own|smell|taste|sound|belong|want|hope|wish|agree|believe|understand|remember|forget|study|travel';
const SINGLE_SUBJECT = new RegExp(
  `${CLAUSE_START}((?:My|Your|His|Her|Our|Their|The|This|That|my|your|his|her|our|their|the|this|that)\\s+(\\p{Ll}+))\\s+(${PLAIN_VERBS})\\b(?=\\s+(?:in|at|on|with|to|for|the|a|an|my|his|her|their|our|your|here|there|every|very|alone|together|nearby|well)\\b|\\s*[.,;!?])`,
  'gu',
);
const ONE_OR_MANY = new Set(
  'team family crew staff police government couple group majority minority audience committee jury class band crowd company army navy council public faculty board fish deer sheep data media people children men women cattle poor rich old young dead living sick blind deaf elderly homeless unemployed wealthy weak strong brave faithful innocent guilty righteous wicked hungry'.split(
    ' ',
  ),
);
const S_FORM: Record<string, string> = {
  go: 'goes',
  do: 'does',
  have: 'has',
  try: 'tries',
  study: 'studies',
  teach: 'teaches',
  wish: 'wishes',
  watch: 'watches',
};

function plainAgreement(text: string, isWord: IsWord, out: Issue[]) {
  for (const m of text.matchAll(SINGLE_SUBJECT)) {
    const noun = m[2]!;
    const verb = m[3]!;
    if (noun.endsWith('s') || ONE_OR_MANY.has(noun) || /(?:ed|ing|ly)$/.test(noun) || !isWord(noun) || !pluralOf(noun, isWord) || noun === verb || describes(noun, isWord)) continue;
    // "my own", "the other": not nouns.
    if (/^(?:own|other|same|first|last|next|only|whole|best|one|two|will|can|may|must|might|you|we|they|i)$/.test(noun)) continue;
    const at = m.index + m[0].length - verb.length;
    const s = S_FORM[verb] ?? `${verb}s`;
    out.push(issue(at, at + verb.length, 'agreement', `“${m[1]}” is one, so the verb is “${s}”.`, [s]));
  }
}

// ---------- Who for things, what for who ----------

const THINGS =
  'book|house|car|table|chair|door|window|city|town|street|road|letter|cake|bread|film|movie|song|story|picture|box|bag|key|cup|plate|bowl|knife|oven|kitchen|shop|recipe|idea|plan|problem|question|thing|place|room|garden|phone|computer|machine|bus|train|ship|boat|watch|clock|ring|dress|coat|shoe|shoes|hat';
const WHO_THING = new RegExp(`\\b(?:the|a|an|this|that|my|your|his|her|our|their)\\s+(?:${THINGS})\\s+(who)\\b`, 'giu');
const WHAT_REL =
  /(?:^|(?<=[.!?…]["”’]?\s+))(?:The|A|An|This|That|My|Your|His|Her|Our|Their)\s+(\p{Ll}+)\s+(what)\s+(?=\p{Ll}+(?:ed|s)\b|(?:I|you|he|she|we|they|was|is|were|are|had|has|came|went|saw|took|made|gave)\b)/gu;
const PEOPLE_START = /(?:^|(?<=[.!?…]["”’]?\s+))(?:People|Children|Men|Women|Students|Teachers|Cooks|Friends)\s+(which)\s+(?=\p{Ll}+)/gu;
const PERSON_NOUN =
  /^(?:man|woman|boy|girl|person|people|child|children|lady|friend|teacher|doctor|cook|chef|baker|mother|father|brother|sister|son|daughter|uncle|aunt|wife|husband|student|nurse|neighbour|neighbor|stranger|guest|customer|waiter)$/;

function relatives(text: string, out: Issue[]) {
  for (const m of text.matchAll(WHO_THING)) {
    const at = m.index + m[0].length - 3;
    out.push(issue(at, at + 3, 'relative-pronoun', '“Who” is for people. For things, use “that” or “which”.', [matchCase(m[1]!, 'that'), matchCase(m[1]!, 'which')]));
  }
  for (const m of text.matchAll(WHAT_REL)) {
    if (CLOSED.has(m[1]!) || isPast(m[1]!)) continue;
    const at = m.index + m[0].lastIndexOf(m[2]!);
    const person = PERSON_NOUN.test(m[1]!);
    out.push(issue(at, at + 4, 'relative-pronoun', `After a noun, it’s “${person ? 'who' : 'that'}”, not “what”.`, [person ? 'who' : 'that']));
  }
  for (const m of text.matchAll(PEOPLE_START)) {
    const at = m.index + m[0].lastIndexOf(m[1]!);
    out.push(issue(at, at + 5, 'relative-pronoun', 'Use “who” or “that” for people. “Which” is for things.', ['who', 'that']));
  }
}

// ---------- Look-alikes ----------

const THEIR_ING = /(?:^|(?<=[.!?…]["”’]?\s+))(Their)\s+(?=(?:going|coming|getting|leaving|not|always|never|here|there|late|ready|right|wrong|gone|done)\b)([^.!?]*)/gu;
const TO_TOO =
  /\b(?:was|is|are|were|be|been|got|felt|feel|seemed|looked|tasted|sounded|far|much)\s+(to)\s+(?=(?:sweet|sour|hot|cold|big|small|late|early|long|short|tired|heavy|expensive|cheap|far|close|young|old|fast|slow|loud|quiet|dark|bright|hard|easy|busy|full|high|low|many|good|bad|thin|thick|salty|spicy|dry|wet|sweet)\s*(?:[.,;!?]|$|\s+(?:to|for)\b))/giu;
const YOUR_WELCOME = /\b(Your|your)\s+(?=welcome\s+(?:to\s+(?!(?:me|him|her|us|them|you|the|my|his|our|their)\b)[a-z]+|here|back|anytime)\b)/gu;
const DOUBLE_NEG = /\b(can't|can’t|couldn't|couldn’t|don't|don’t|didn't|didn’t|won't|won’t|wasn't|wasn’t|isn't|isn’t)\s+(?=(?:hardly|scarcely|barely)\b)/giu;
const POSITIVE: Record<string, string> = {
  "can't": 'can',
  'can’t': 'can',
  "couldn't": 'could',
  'couldn’t': 'could',
  "don't": 'do',
  'don’t': 'do',
  "didn't": 'did',
  'didn’t': 'did',
  "won't": 'will',
  'won’t': 'will',
  "wasn't": 'was',
  'wasn’t': 'was',
  "isn't": 'is',
  'isn’t': 'is',
};

function lookAlikes(text: string, out: Issue[]) {
  const ap = text.includes('’') || !text.includes("'") ? '’' : "'";
  for (const m of text.matchAll(THEIR_ING)) {
    // "Their coming home was a surprise": a verb later means "their coming" is a thing.
    if (/\b(?:was|is|were|are|made|caused|meant|surprised|pleased)\b/u.test(m[2]!)) continue;
    out.push(issue(m.index, m.index + 5, 'look-alike', `“They${ap}re” (they are) is the one here. “Their” owns things.`, [`They${ap}re`]));
  }
  for (const m of text.matchAll(TO_TOO)) {
    const at = m.index + m[0].length - 2;
    out.push(issue(at, at + 2, 'look-alike', '“Too” means “more than enough”. “To” points somewhere.', ['too']));
  }
  for (const m of text.matchAll(YOUR_WELCOME)) out.push(issue(m.index, m.index + 4, 'look-alike', `“You${ap}re” (you are) is the one here.`, [matchCase(m[1]!, `you${ap}re`)]));
  for (const m of text.matchAll(DOUBLE_NEG)) {
    const neg = m[1]!;
    out.push(fix(text, m.index, m.index + neg.length, 'double-negative', '“Hardly” is already negative, so drop the “not”.', POSITIVE[neg.toLowerCase()]!));
  }
}

/** Every check in this file on one paragraph. */
export function learnerIssues(text: string, isWord: IsWord): Issue[] {
  const out: Issue[] = [];
  nounNumber(text, isWord, out);
  articles(text, out);
  prepositions(text, out);
  wordOrder(text, isWord, out);
  tenseTime(text, out);
  wordForms(text, isWord, out);
  plainAgreement(text, isWord, out);
  lookAlikes(text, out);
  relatives(text, out);
  // Pronoun subjects after "and" at the start: "Me and my friend went", "Him and his wife arrived".
  for (const m of text.matchAll(/(?:^|(?<=[.!?…]["”’]?\s+))(Me|Him|Her|Us|Them)\s+and\s+(?:my|his|her|their|our|your|the)\s+\p{L}+\s+(?=\p{Ll}+(?:ed)?\b)/gu)) {
    const SUBJ: Record<string, string> = {
      Me: 'I',
      Him: 'He',
      Her: 'She',
      Us: 'We',
      Them: 'They',
    };
    const word = m[1]!;
    if (word === 'Her') continue; // "Her and my…" is rare and "Her" is often a possessive.
    out.push(issue(m.index, m.index + word.length, 'pronoun-case', `As the subject, it’s “${SUBJ[word]}”: “My friend and I went”.`, [SUBJ[word]!]));
  }
  for (const m of text.matchAll(/\b(?:to|with|from|at|by|about|behind|beside|toward|towards|against|without)\s+(I)(?=\s*(?:[.,;!?]|$))/gu)) {
    const at = m.index + m[0].length - 1;
    out.push(issue(at, at + 1, 'pronoun-case', 'After a word like “to” or “with”, it’s “me”.', ['me']));
  }
  return out;
}
