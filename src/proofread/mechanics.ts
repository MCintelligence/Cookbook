import { dialogueRanges } from '../editor/dialogue';
import { type Issue } from './check';

/**
 * More of Peppery Pete's rule checks, for the kinds of mistake Word's grammar
 * checker looks for and Pete didn't yet: punctuation around speech, a question
 * that ends in a full stop, the comma after "however" or "yes", "which" for a
 * person, a verb in the wrong form after "could" or "will", "real good", the
 * hyphens in "twenty-one" and "a five-year-old boy", "each of them were", and
 * "lets go" or "whose there".
 *
 * Word's list of check categories (its published Grammar Settings) said what
 * to look for; every rule and word list here is Cookbook's own, written from
 * the usual style guides (Chicago, Oxford), not taken from Word.
 *
 * Each check matches a narrow pattern rather than guessing, since a wrong
 * underline costs more than a missed one.
 */

export const MECHANICS_RULES: { id: string; label: string }[] = [
  {
    id: 'speech-punctuation',
    label: 'Punctuation around speech (“Hello.” she said)',
  },
  { id: 'question-mark', label: 'Questions that end in a full stop' },
  {
    id: 'intro-comma',
    label: 'Comma after an opener (However, Yes, Of course)',
  },
  { id: 'relative-pronoun', label: 'Who, which and that (the man which…)' },
  {
    id: 'verb-after-modal',
    label: 'Verbs after could, will, can (could went)',
  },
  { id: 'adverb-form', label: 'Adjective for adverb (real quick, sings good)' },
  {
    id: 'compound-hyphen',
    label: 'Missing hyphens (twenty one, a five year old boy)',
  },
];

/** Checks here that are about writing, not how a character talks, so they read speech too. */
export const SPEECH_TOO = new Set(['speech-punctuation', 'question-mark', 'intro-comma', 'look-alike']);

const issue = (from: number, to: number, rule: string, message: string, suggestions: string[]): Issue => ({ from, to, kind: 'grammar', rule, message, suggestions });
const matchCase = (original: string, replacement: string) => (/^\p{Lu}/u.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement);

const SUBJECT_PRONOUNS = 'i|you|he|she|it|we|they';
const DETERMINERS = 'the|a|an|my|your|his|her|its|our|their|this|that|these|those';

/** Verbs that tag speech: “Hello,” she said. */
const SPEECH_VERBS =
  'said|says|say|asked|asks|ask|replied|replies|reply|answered|answers|whispered|whispers|shouted|shouts|yelled|yells|cried|cries|called|calls|muttered|mutters|murmured|murmurs|added|adds|snapped|snaps|sighed|sighs|laughed|laughs|told|tells|began|begins|continued|continues|insisted|insists|repeated|repeats|explained|explains|agreed|agrees|demanded|demands|exclaimed|exclaims|screamed|screams|mumbled|mumbles|growled|growls|hissed|hisses|breathed|breathes|admitted|admits|offered|offers|suggested|suggests|warned|warns|wondered|wonders';

/** Words that start a question when they come first: "Did you", "Is it". */
const QUESTION_AUX =
  "do|does|did|can|could|will|would|should|shall|is|are|am|was|were|have|has|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't|haven't|hasn't";
// Not "which": "Which was a mistake." is a fragment, not a question.
const QUESTION_WH = 'why|where|when|how|what|who';
const WH_AUX = 'do|does|did|is|are|am|was|were|can|could|will|would|should|have|has';

const AUX_START = new RegExp(`^(?:${QUESTION_AUX})[\\s]+(?:${SUBJECT_PRONOUNS}|there|${DETERMINERS})\\b`, 'iu');
const WH_START = new RegExp(`^(?:${QUESTION_WH})\\s+(?:${WH_AUX})\\s+(?:${SUBJECT_PRONOUNS}|there|${DETERMINERS})\\b`, 'iu');

/** Whether the words of a sentence (or a quote) ask a question by their order. */
export const asksByOrder = (words: string) => {
  const w = words.replace(/’/g, "'").trim();
  return AUX_START.test(w) || WH_START.test(w);
};

// ---------- Speech ----------

/**
 * “I’m hungry.” he said → “I’m hungry,” he said. A full stop inside the quote
 * followed by a tag in lower case should be a comma, or a question mark when
 * the quote asks. He said “Hello.” → He said, “Hello.” And “Hello,” He said
 * → he said.
 */
function speechPunctuation(text: string, out: Issue[]) {
  for (const [open, close] of dialogueRanges(text)) {
    const end = close - 1;
    const mark = text[end - 1];
    if (close >= text.length || !/["”]/.test(text[end]!)) continue;
    const after = text.slice(close);
    const tag = new RegExp(`^\\s+(?:(?:${SUBJECT_PRONOUNS})\\s+(?:${SPEECH_VERBS})|(?:${SPEECH_VERBS})\\b)`, 'u').exec(after);
    const capitalTag = new RegExp(`^\\s+(He|She|They|We|It|You)\\s+(?:${SPEECH_VERBS})\\b`, 'u').exec(after);
    if (mark === '.' && tag && text[end - 2] !== '.') {
      const asks = asksByOrder(text.slice(open + 1, end - 1));
      out.push(
        issue(
          end - 1,
          end,
          'speech-punctuation',
          asks ? 'This speech asks a question, so it ends with a question mark before the tag.' : 'Speech followed by a tag such as “she said” ends with a comma, not a full stop.',
          [asks ? '?' : ','],
        ),
      );
    } else if (mark === ',' && capitalTag) {
      const from = close + capitalTag[0].indexOf(capitalTag[1]!);
      const word = capitalTag[1]!;
      out.push(issue(from, from + word.length, 'speech-punctuation', 'The tag after speech carries on the same sentence, so it starts in lower case.', [word.toLowerCase()]));
    }
  }
  // He said “Hello.” → He said, “Hello.”
  const before = new RegExp(`\\b(said|asked|replied|answered|whispered|shouted|yelled|cried|muttered|murmured|added|snapped|exclaimed|demanded|screamed)( +)(?=[“"]\\p{Lu}[^”"]*[.!?][”"])`, 'giu');
  for (const m of text.matchAll(before)) {
    const verb = m[1]!;
    out.push(issue(m.index, m.index + verb.length, 'speech-punctuation', `Put a comma after “${verb}” when the speech follows it.`, [`${verb},`]));
  }
}

// ---------- Questions ----------

/** Where sentences start: the paragraph's start, after an end mark and space, or after an opening quote. */
const SENTENCE_START = /(?:^|(?<=[.!?…]["”’]?\s+)|(?<=[“"]))(?=\p{Lu})/gu;
/** Abbreviations that end in a full stop but don't end the sentence. */
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt|Prof|Capt|Col|Gen|Lt|Sgt|Rev|vs|etc|No|Messrs|\p{Lu})$/u;
/** "Do it this way." "Don't you be afraid." are orders, not questions. */
const ORDER =
  /^(?:(?:have|has)\s+(?!(?:i|you|he|she|it|we|they|there)\b)|(?:do|don't|don’t)\s+(?:it|that|this|the|a|an|my|your|his|her|our|their|there|you\s+(?:be|dare|worry|ever|go|come|touch|say|tell|let|forget|mind)\b))/iu;

/** Do you know where the salt is. → ? */
function questionMarks(text: string, out: Issue[]) {
  for (const m of text.matchAll(SENTENCE_START)) {
    const from = m.index;
    const rest = text.slice(from);
    const end = /[.!?…]/u.exec(rest);
    if (!end || end[0] !== '.') continue;
    const body = rest.slice(0, end.index);
    // "Had I known, I'd have stayed." "Should you need me, call." A comma or a dash makes it a condition or a list.
    if (/[,;:—–(]/u.test(body)) continue;
    // "Mr. Smith", "a.m." and the like: a letter straight after the stop.
    const next = rest[end.index + 1];
    if (next && /\p{L}/u.test(next)) continue;
    if (rest[end.index + 1] === '.') continue;
    if (ABBREVIATION.test(body) || ORDER.test(body) || !asksByOrder(body)) continue;
    // Speech followed by a tag is speechPunctuation's.
    const at = from + end.index;
    if (/["”]\s+\p{Ll}/u.test(text.slice(at + 1, at + 4))) continue;
    out.push(issue(at, at + 1, 'question-mark', 'These words ask a question, so the sentence ends with a question mark.', ['?']));
  }
}

// ---------- Openers ----------

/** Openers that are followed by a comma when a clause comes after them. */
// "Of course I will", "Fortunately it rained": fiction often leaves these without a comma, so they aren't here.
const OPENERS = 'however|moreover|furthermore|nevertheless|nonetheless|consequently|yes|no|oh|well|in fact|for example|for instance|on the other hand|in other words|as a result';
const INTRO = new RegExp(`(?:^|(?<=[.!?…]["”’]?\\s+)|(?<=[“"]))(${OPENERS})( +)(?=(?:${SUBJECT_PRONOUNS})\\b|(?:the|this|that|there)\\s)`, 'giu');
/** Openers that also start clauses of their own: "Well I know", but not "Well done". Only a pronoun may follow them. */
const PRONOUN_ONLY = new Set(['no', 'oh', 'well', 'yes']);

/** However the soup was cold. → However, the soup… */
function introCommas(text: string, out: Issue[]) {
  for (const m of text.matchAll(INTRO)) {
    const opener = m[1]!;
    const next = /^\s*(\p{L}+)/u.exec(text.slice(m.index + m[0].length))?.[1]?.toLowerCase() ?? '';
    if (PRONOUN_ONLY.has(opener.toLowerCase()) && !new RegExp(`^(?:${SUBJECT_PRONOUNS})$`).test(next)) continue;
    // "However that may be", "however it happened": "however" meaning "in whatever way".
    if (/^however$/i.test(opener) && /^\s*\p{L}+[^.!?]*\b(?:may|might|be|happened|was done)\s*[.!?,]/u.test(text.slice(m.index + m[0].length).split(/[.!?]/)[0]! + '.')) continue;
    // "No it isn't" is fine to flag; "No I" too. "No there" / "No the" never reach here.
    out.push(issue(m.index, m.index + opener.length, 'intro-comma', `Put a comma after “${opener}” when it opens the sentence.`, [`${opener},`]));
  }
}

// ---------- Who, which and that ----------

const PEOPLE =
  'man|woman|men|women|boy|boys|girl|girls|person|people|child|children|lady|ladies|gentleman|gentlemen|friend|friends|teacher|teachers|doctor|doctors|cook|cooks|chef|chefs|baker|bakers|king|queen|soldier|soldiers|stranger|strangers|neighbour|neighbours|neighbor|neighbors|mother|father|brother|sister|son|daughter|uncle|aunt|cousin|wife|husband|guy|guys|student|students|nurse|nurses|waiter|waiters|farmer|farmers|priest|officer|officers|servant|servants|driver|guard|guards|witness|lawyer|captain|stranger';
const WHICH_PERSON = new RegExp(
  `\\b(?:the|a|an|this|that|these|those|my|your|his|her|our|their|every|any)\\s+(?:\\p{L}+\\s+)?(?:${PEOPLE})\\s+(which)\\s+(?=\\p{L}+(?:ed|s)\\b|(?:was|were|is|are|had|has|lived|knew|came|went|stood|sat|ran|said|told|gave|took|made|saw)\\b)`,
  'giu',
);

/** Words that end a clause's subject and start what it does, so "the man said, that…" isn't a relative clause. */
const NOT_A_NOUN = /(?:ed|ing|ly)$|^(?:said|says|knew|knows|thought|thinks|told|tells|felt|feels|heard|saw|was|were|is|are|had|has|did|does)$/u;
// Only inside a sentence's subject, closed by a second comma: "The oven, that was old, still worked." After a comma mid-sentence,
// "that was all" usually starts a clause of its own.
const COMMA_THAT =
  /(?:^|(?<=[.!?…]["”’]?\s+)|(?<=[“"]))(?:The|A|An|My|Your|His|Her|Our|Their|This|Its)\s+(?:\p{L}+\s+){0,2}(\p{L}+)(,\s+that)\s+(?=(?:was|were|is|are|had|has|stood|sat|lay|hung|ran|seemed|looked|made|kept|held)\b[^.!?,;]*,\s+\p{Ll})/gu;

/** The man which lived next door → who. The oven, that was old, → , which. */
function relatives(text: string, out: Issue[]) {
  for (const m of text.matchAll(WHICH_PERSON)) {
    // "the head of his fair wife which had": the "which" may belong to the head, not the wife.
    if (/\bof\s*$/iu.test(text.slice(0, m.index))) continue;
    const at = m.index + m[0].lastIndexOf(m[1]!);
    out.push(issue(at, at + 5, 'relative-pronoun', 'Use “who” or “that” for people. “Which” is for things.', [matchCase(m[1]!, 'who'), matchCase(m[1]!, 'that')]));
  }
  for (const m of text.matchAll(COMMA_THAT)) {
    // "so dreadful, that", "such a noise, that": a result, not a relative clause.
    if (NOT_A_NOUN.test(m[1]!.toLowerCase()) || /\b(?:so|such|too)\b/iu.test(m[0])) continue;
    const at = m.index + m[0].length - m[2]!.length - 1;
    const from = text.indexOf(',', at);
    out.push(issue(from, from + m[2]!.length, 'relative-pronoun', 'Between commas, an extra fact about the thing takes “which”, not “that”.', [', which']));
  }
}

// ---------- Verbs after could, will, can ----------

/** Past tenses with the plain form a modal takes. Past forms that are also plain verbs (fell, found, saw, bore, lay…) are left out. */
const PLAIN_OF_PAST: Record<string, string> = Object.fromEntries(
  'went:go came:come took:take knew:know ate:eat gave:give wrote:write spoke:speak ran:run began:begin drank:drink drove:drive forgot:forget grew:grow kept:keep left:leave made:make met:meet paid:pay rode:ride sang:sing sent:send slept:sleep spent:spend stood:stand stole:steal swam:swim taught:teach thought:think threw:throw told:tell understood:understand woke:wake wore:wear won:win broke:break brought:bring bought:buy built:build caught:catch chose:choose felt:feel flew:fly heard:hear held:hold sold:sell shook:shake sat:sit tore:tear got:get became:become did:do'
    .split(' ')
    .map((p) => p.split(':') as [string, string]),
);
/** -s forms with their plain form: "will goes" → "will go". */
const PLAIN_OF_S: Record<string, string> = Object.fromEntries(
  'goes:go does:do has:have says:say makes:make takes:take comes:come gets:get knows:know sees:see thinks:think wants:want needs:need looks:look gives:give tells:tell finds:find feels:feel becomes:become leaves:leave seems:seem tries:try'
    .split(' ')
    .map((p) => p.split(':') as [string, string]),
);
const MODALS = "can|could|will|would|shall|should|may|might|must|can't|couldn't|won't|wouldn't|shouldn't|mustn't|cannot";
const AFTER_MODAL = new RegExp(`\\b(${MODALS})(\\s+(?:not\\s+|never\\s+|always\\s+|just\\s+|still\\s+)?)(\\p{L}+)\\b`, 'giu');
/** After "to", only the forms that can't be anything else: "to went". */
const AFTER_TO = /\b(to)(\s+)(went|came|took|knew|ate|gave|wrote|spoke|began|drank|drove|forgot|grew|sang|slept|swam|threw|broke|chose|stole|wore|woke|rode)\b/giu;
const NOUN_BEFORE = /\b(?:the|a|an|his|her|my|your|their|our|its|this|that|free|good|ill|last|own|strong|iron|sheer|divine|general|popular|human|and|of)\s*$/iu;

/** She could went → go. They will goes → go. */
function verbsAfterModals(text: string, out: Issue[], isWord?: (word: string) => boolean) {
  for (const m of text.matchAll(AFTER_MODAL)) {
    const modal = m[1]!;
    // "the can", "his will", "a must"; "Will" and "May" are names and a month too.
    if (NOUN_BEFORE.test(text.slice(0, m.index)) || /^(?:Will|May|Can)$/.test(modal)) continue;
    const word = m[3]!;
    const lower = word.toLowerCase().replace(/’/g, "'");
    const regular = /^(\p{Ll}{3,})ed$/u.exec(lower)?.[1];
    const plain =
      PLAIN_OF_PAST[lower] ??
      PLAIN_OF_S[lower] ??
      (regular && isWord ? [regular, `${regular}e`, regular.slice(0, -1)].find((b) => b.length > 2 && isWord(b) && isWord(`${b.replace(/e$/, '')}ing`) && !/ed$/.test(b)) : undefined);
    // "must needs" is old English for "must".
    if (!plain || (lower === 'needs' && /^must$/i.test(modal))) continue;
    // "his will still held": "will" the noun, then an adverb.
    if (/^will$/i.test(modal) && m[2]!.trim() !== '' && !/^(?:not|never)$/i.test(m[2]!.trim())) continue;
    // "could have", "would be" are right; "had"/"was" only after the modal itself.
    const at = m.index + m[0].length - word.length;
    out.push(issue(at, at + word.length, 'verb-after-modal', `After “${modal}”, the verb takes its plain form: “${plain}”.`, [matchCase(word, plain)]));
  }
  for (const m of text.matchAll(AFTER_TO)) {
    const word = m[3]!;
    const plain = PLAIN_OF_PAST[word.toLowerCase()]!;
    const at = m.index + m[0].length - word.length;
    out.push(issue(at, at + word.length, 'verb-after-modal', `After “to”, the verb takes its plain form: “${plain}”.`, [matchCase(word, plain)]));
  }
}

/** The cake was eat → eaten. Plain forms whose past participle differs, after "was" or "were". */
const PARTICIPLE: Record<string, string> = {
  eat: 'eaten',
  take: 'taken',
  give: 'given',
  write: 'written',
  speak: 'spoken',
  break: 'broken',
  choose: 'chosen',
  steal: 'stolen',
  forget: 'forgotten',
  drive: 'driven',
  see: 'seen',
  know: 'known',
  throw: 'thrown',
  wear: 'worn',
  tear: 'torn',
  draw: 'drawn',
  grow: 'grown',
  hide: 'hidden',
  bite: 'bitten',
  shake: 'shaken',
  forgive: 'forgiven',
  freeze: 'frozen',
  ride: 'ridden',
  sing: 'sung',
  drink: 'drunk',
  begin: 'begun',
  sink: 'sunk',
  bring: 'brought',
  buy: 'bought',
  catch: 'caught',
  teach: 'taught',
  sell: 'sold',
  tell: 'told',
  find: 'found',
  make: 'made',
  send: 'sent',
  build: 'built',
  leave: 'left',
  lose: 'lost',
  pay: 'paid',
  keep: 'kept',
  hold: 'held',
};
const BARE_AFTER_BE = new RegExp(`\\b(?:was|were|been|being|is|are|be)\\s+(${Object.keys(PARTICIPLE).join('|')})\\b(?!\\s+(?:to|of)\\b)`, 'gu');

function bareParticiples(text: string, out: Issue[]) {
  for (const m of text.matchAll(BARE_AFTER_BE)) {
    const word = m[1]!;
    // "what he was to see", "the best was yet to come" never reach here; "were leave" is still a slip.
    const at = m.index + m[0].length - word.length;
    out.push(issue(at, at + word.length, 'verb-after-modal', `After “was” or “were”, it’s “${PARTICIPLE[word]}”.`, [PARTICIPLE[word]!]));
  }
}

// ---------- Real quick, sings good ----------

const REAL_ADJ = /\b(real)\s+(?=(?:good|nice|quick|fast|slow|bad|hard|easy|happy|pretty|close|quiet|careful|big|small|hot|cold|soon|well|sure|glad|sorry|tired|funny|strange|loud)\b(?!-))/giu;
const ACTION_GOOD =
  /\b(?:sings|sang|sing|singing|plays|played|play|playing|cooks|cooked|cook|cooking|dances|danced|dance|dancing|writes|wrote|write|writing|drives|drove|swims|swam|speaks|spoke|works|worked|behaves|behaved|performs|performed|bakes|baked)\s+(good)\b(?=\s*(?:[.,;!?…”"]|$|\s+(?:at|for|in|with|today|now|tonight|enough|too)\b))/giu;
const ACTION_QUICK =
  /\b(?:ran|run|runs|running|moved|move|moves|moving|walked|walk|walks|walking|ate|eat|eats|eating|drove|drive|drives|driving|worked|work|works|working|spoke|speak|speaks|speaking|talked|talk|talks|talking|breathed|breathe|breathes|thought|think|thinks|whispered|answered|replied|listened|listen|listens)\s+(quick|quiet|careful|slow|bad|loud|soft|polite|rude|nervous|angry|happy|sad|calm)\b(?=\s*(?:[.,;!?…”"]|$|\s+(?:to|at|for|in|with|and|but|as|from|into|across|through|along|down|up|away|back|toward|towards)\b))/giu;
const ADVERB: Record<string, string> = {
  quick: 'quickly',
  quiet: 'quietly',
  careful: 'carefully',
  slow: 'slowly',
  bad: 'badly',
  loud: 'loudly',
  soft: 'softly',
  easy: 'easily',
  polite: 'politely',
  rude: 'rudely',
  nervous: 'nervously',
  angry: 'angrily',
  happy: 'happily',
  sad: 'sadly',
  calm: 'calmly',
};

/** He ran real quick → really quickly. She sings good → well. */
function adverbForms(text: string, out: Issue[]) {
  for (const m of text.matchAll(REAL_ADJ)) out.push(issue(m.index, m.index + 4, 'adverb-form', '“Real” describes things. Before a describing word, use “really”.', [matchCase(m[1]!, 'really')]));
  for (const m of text.matchAll(ACTION_GOOD)) {
    const at = m.index + m[0].length - 4;
    out.push(issue(at, at + 4, 'adverb-form', '“Good” describes things. For how something is done, use “well”.', [matchCase(m[1]!, 'well')]));
  }
  for (const m of text.matchAll(ACTION_QUICK)) {
    const word = m[1]!;
    const at = m.index + m[0].length - word.length;
    const fix = ADVERB[word.toLowerCase()]!;
    out.push(issue(at, at + word.length, 'adverb-form', `For how something is done, use “${fix}”.`, [matchCase(word, fix)]));
  }
}

// ---------- Hyphens ----------

const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const UNITS = 'one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth';
const COMPOUND_NUMBER = new RegExp(`\\b(${TENS}) (${UNITS})\\b`, 'giu');
const NUMBER = `\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|(?:${TENS})-(?:${UNITS})`;
const AGE = new RegExp(`\\b(?:a|an|the|his|her|my|your|their|our|this|that)\\s+((${NUMBER}) (year|month|week|day) old)\\b`, 'giu');
const WELL = new RegExp(
  `\\b(?:a|an|the|his|her|my|your|their|our|this|that|its)\\s+((well|ill|badly|best|better|least) (known|made|done|dressed|meaning|read|educated|kept|lit|worn|timed|behaved|loved|placed|paid|deserved|established|intentioned|informed|mannered|tempered|equipped|organised|organized|groomed|fed|built|rounded|thought|liked))\\s+(?!(?:is|was|were|are|and|or|but|of|to|by|for|in|at|on|with|as|than|enough)\\b)(?=\\p{L})`,
  'giu',
);

/** twenty one → twenty-one; a five year old boy → five-year-old; a well known recipe → well-known. */
function hyphens(text: string, out: Issue[]) {
  for (const m of text.matchAll(COMPOUND_NUMBER)) {
    out.push(issue(m.index, m.index + m[0].length, 'compound-hyphen', 'Numbers from twenty-one to ninety-nine take a hyphen.', [`${m[1]}-${m[2]}`]));
  }
  for (const m of text.matchAll(AGE)) {
    const at = m.index + m[0].length - m[1]!.length;
    out.push(issue(at, at + m[1]!.length, 'compound-hyphen', 'An age used as a describing word, or as a noun, is hyphenated.', [m[1]!.replace(/ /g, '-')]));
  }
  for (const m of text.matchAll(WELL)) {
    const at = m.index + m[0].length - m[1]!.length - (m[0].length - m[0].trimEnd().length);
    const phrase = m[1]!;
    const from = text.indexOf(phrase, m.index);
    if (from < 0 || from !== at) continue;
    out.push(issue(from, from + phrase.length, 'compound-hyphen', 'Two words that describe a noun together, before it, are joined with a hyphen.', [phrase.replace(' ', '-')]));
  }
}

// ---------- Each of them were ----------

const ONE_OF =
  /\b(each|every one|either|neither|one) of (?:the|these|those|my|your|his|her|our|their|them|us|you)(?: \p{L}+?(?:s|people|children|men|women))?\s+(were|are|have|do|don't|aren't|weren't|haven't|was|is)\b/giu;
const TO_ONE: Record<string, string> = {
  were: 'was',
  are: 'is',
  have: 'has',
  do: 'does',
  "don't": "doesn't",
  "aren't": "isn't",
  "weren't": "wasn't",
  "haven't": "hasn't",
};

/** Each of the cooks were tired → was. */
function oneOf(text: string, out: Issue[]) {
  for (const m of text.matchAll(ONE_OF)) {
    const verb = m[2]!;
    const fix = TO_ONE[verb.toLowerCase().replace(/’/g, "'")];
    if (!fix) continue;
    // "only one of the cooks were", "one of the few who were": leave anything after "who" or "that" alone (the regex has none).
    if (/\b(?:the only|only)\s*$/iu.test(text.slice(0, m.index))) continue;
    const at = m.index + m[0].length - verb.length;
    out.push(issue(at, at + verb.length, 'agreement', `“${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} of…” means one at a time, so the verb is “${fix}”.`, [fix]));
  }
}

// ---------- Lets, whose ----------

const LETS =
  /(?:^|(?<=[.!?…,]["”’]?\s+)|(?<=[“"]))(Lets|lets)(?=\s+(?:go|get|see|eat|try|have|do|make|take|be|just|not|hope|say|find|talk|start|move|keep|leave|think|wait|look|call|stop|all|us|me|him|her|them|face)\b)/gu;
const WHOSE = /\b(whose)(?=\s+(?:going|coming|gonna|been|not|there|getting|doing|asking|leaving|next|that|this|it)\b)/giu;

/** Lets go → Let’s go. Whose there? → Who’s there? */
function letsAndWhose(text: string, out: Issue[]) {
  const apostrophe = text.includes('’') || !text.includes("'") ? '’' : "'";
  for (const m of text.matchAll(LETS)) out.push(issue(m.index, m.index + 4, 'look-alike', '“Let’s” (let us) needs its apostrophe here. “Lets” means “allows”.', [`${m[1]![0]}et${apostrophe}s`]));
  for (const m of text.matchAll(WHOSE)) {
    out.push(issue(m.index, m.index + 5, 'look-alike', '“Who’s” is short for “who is” or “who has”. “Whose” owns things.', [matchCase(m[1]!, `who${apostrophe}s`)]));
  }
}

/** Every check in this file on one paragraph. */
export function mechanicsIssues(text: string, isWord?: (word: string) => boolean): Issue[] {
  const out: Issue[] = [];
  speechPunctuation(text, out);
  questionMarks(text, out);
  introCommas(text, out);
  relatives(text, out);
  verbsAfterModals(text, out, isWord);
  bareParticiples(text, out);
  adverbForms(text, out);
  hyphens(text, out);
  oneOf(text, out);
  letsAndWhose(text, out);
  return out;
}
