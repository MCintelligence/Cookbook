import { type Issue } from './check';
import { PETE_RULES } from './pete';
import { STYLE_RULES } from './style';

/**
 * The seasonings: four characters who each read the page for one thing and
 * say what they found in their own voice. Which checks run follows which
 * characters the writer picked.
 */
export type SeasoningId = 'sam' | 'pete' | 'daniel' | 'sally';

export const SEASONINGS: { id: SeasoningId; name: string; role: string }[] = [
  { id: 'sam', name: 'Salty Sam', role: 'Spelling' },
  { id: 'pete', name: 'Peppery Pete', role: 'Grammar' },
  { id: 'daniel', name: 'Drunk Daniel', role: 'Dialogue' },
  { id: 'sally', name: 'Spicy Sally', role: 'Style' },
];

export const isSeasoning = (id: unknown): id is SeasoningId => SEASONINGS.some((s) => s.id === id);

/** The proofreader's rule groups (see rules.ts) each character looks after. Daniel needs none. */
export const RULES_OF: Record<SeasoningId, string[]> = {
  sam: ['spelling', 'name'],
  pete: ['grammar', 'unclosed-quote', 'stray-capitals', ...PETE_RULES.map((r) => r.id)],
  daniel: [],
  sally: ['harper-style', ...STYLE_RULES.map((r) => r.id)],
};

/** Rule groups to switch off because nobody picked the character who checks them. */
export function rulesOff(chosen: readonly SeasoningId[]): string[] {
  return SEASONINGS.filter((s) => !chosen.includes(s.id)).flatMap((s) => RULES_OF[s.id]);
}

/** Whose an issue is. */
export function ownerOf(issue: Pick<Issue, 'kind' | 'rule'>): SeasoningId {
  if (issue.kind === 'spelling') return 'sam';
  if (issue.kind === 'grammar') return 'pete';
  return 'sally';
}

/** One of a few lines, the same one each time for the same words, so remarks don't shuffle as the page changes. */
function pick<T>(lines: readonly T[], seed: string | number): T {
  const n = typeof seed === 'number' ? seed >>> 0 : [...seed].reduce((h, c) => (h * 31 + c.codePointAt(0)!) >>> 0, 7);
  return lines[n % lines.length]!;
}

/** Mixes a few numbers into one, so lines chosen by them spread evenly. */
export function mix(...parts: number[]): number {
  return parts.reduce((h, p) => Math.imul(h ^ (p >>> 0), 2654435761) >>> 0, 2166136261);
}

/** Salty Sam on a word spelt wrong: an old sailor who has seen it all and liked none of it. */
const SAM_WORD = [
  (w: string) => `“${w}”? Not in any dictionary I’ve sailed past.`,
  (w: string) => `Salt in the wound: “${w}” is spelt wrong.`,
  (w: string) => `“${w}”. Bold spelling. Wrong, but bold.`,
  (w: string) => `Blimey. “${w}” has taken on water.`,
  (w: string) => `Forty years at sea and I’ve never met a “${w}”.`,
  (w: string) => `“${w}”? Even the ship’s parrot spells better than that.`,
  (w: string) => `Man overboard: “${w}”. Fish it out and spell it proper.`,
  (w: string) => `“${w}” is listing to port, sailor. Right it.`,
  (w: string) => `Barnacles! “${w}” needs a good scraping.`,
  (w: string) => `I’d keelhaul a deckhand for “${w}”.`,
];
const SAM_NAME = [
  (n: string) => `That’s not how ${n} spells it, and they’d know.`,
  (n: string) => `Mind your crew’s names, sailor. It’s ${n}.`,
  (n: string) => `${n} would make you walk the plank for that spelling.`,
  (n: string) => `You’ve sailed with ${n} this long and still can’t spell them?`,
];
const SAM_APOSTROPHE = ['No apostrophe? Bold. Wrong, but bold.', 'Lost your apostrophe overboard, sailor. Hook it back on.', 'An apostrophe’s gone missing. Check the bilges.'];

/** Peppery Pete, sweetly passive-aggressive, after the plain fact of what is wrong. */
const PETE_TAIL = [
  '',
  ' Just saying.',
  ' But you knew that.',
  ' No pressure.',
  ' Per my last underline.',
  ' I’m sure it was a typo.',
  ' Not that it matters. It matters.',
  ' Happy to help, as always.',
  ' Totally fine. Mostly fine.',
  ' I’ll wait.',
];

/** Pete names the trouble first, then says what to do; for the Harper rules writers meet most, in his own words. */
const PETE: Record<string, (word: string, fix: string | undefined, message: string) => string | undefined> = {
  agreement: (_w, _f, m) => `Agreement! ${m}`,
  'word-mixup': (_w, _f, m) => `Mix-up! ${m}`,
  'pronoun-case': (_w, _f, m) => `Wrong case! ${m}`,
  'verb-form': (_w, _f, m) => `Verb form! ${m}`,
  'reported-question': (_w, _f, m) => `Word order! ${m}`,
  PronounVerbAgreement: (_w, f) => f && `Agreement! That verb doesn’t match its subject. Make it “${f}”.`,
  PronounInflectionBe: (_w, f) => f && `Agreement! That verb doesn’t match its subject. Make it “${f}”.`,
  AnA: () => 'Grammar! It’s “an” before a vowel sound and “a” before the rest.',
  ItsContraction: () => 'Mix-up! “Its” owns things. Here you mean “it’s”, short for “it is”.',
  ItsPossessive: () => 'Mix-up! “It’s” is short for “it is”. For belonging, it’s “its”.',
  TheirToThere: (_w, f) => f && `Mix-up! You mean “${f}”.`,
  ThenThan: (_w, f) => f && `Mix-up! You mean “${f}”.`,
  ModalOf: (_w, f) => f && `Grammar! It’s “${f}”. “Of” only sounds like “’ve”.`,
  RepeatedWords: (w) => `Twice! “${w}” says the same word two times.`,
  SimplePastToPastParticiple: (_w, f) => f && `Verb form! After “has” or “had” it’s “${f}”.`,
  SentenceCapitalization: () => 'Capitals! A sentence starts with a capital letter.',
  CapitalizePersonalPronouns: () => 'Capitals! “I” is always a capital.',
  AdjectiveDoubleDegree: (_w, f) => f && `Double helping! “${f}” already means more.`,
};

/** Spicy Sally: flirtatious, quick and a little wicked, never mean. */
const SALLY_ON: Record<string, ((w: string) => string)[]> = {
  adverb: [
    (w) => `Adverb alert! Could a stronger verb bring the heat instead of “${w}”?`,
    (w) => `“${w}”? Darling, let the verb do the work. It’s so much more attractive.`,
    (w) => `Lose “${w}”, hon. Show me, don’t tell me.`,
    (w) => `“${w}” is propping up a lazy verb. I like mine with a bit more muscle.`,
  ],
  'crutch-word': [
    (w) => `Crutch word! Does the sentence really need “${w}”?`,
    (w) => `“${w}”? You don’t need it, darling. Neither does the sentence.`,
    (w) => `Stand on your own two feet, sugar. Drop “${w}”.`,
    (w) => `“${w}” again? Lean on me instead.`,
  ],
  passive: [
    () => 'Passive voice, how bland. Who’s doing the doing here?',
    () => 'Passive? I prefer someone who takes charge.',
    () => 'Don’t be coy, darling. Tell me who did it.',
    () => 'Something was done by someone. Thrilling. Who, sugar, who?',
  ],
  cliche: [
    (w) => `A cliché? “${w}” lost its kick years ago.`,
    (w) => `“${w}”? Darling, that line’s been used on me before.`,
    (w) => `“${w}”. Heard it. Whisper me something new.`,
    (w) => `Oh, “${w}”. How very… last century.`,
  ],
  echo: [
    (w) => `“${w}” again, so soon? Same spice twice. Swap one.`,
    (w) => `Twice in a row, “${w}”? Variety, darling. It keeps things exciting.`,
    (w) => `“${w}” already had its moment. Give someone else a turn.`,
    (w) => `Repeating “${w}”? Charming once. Less so twice.`,
  ],
  'harper-style': [() => 'Too much filler in the pot.', () => 'All this padding, darling. Show a little more.', () => 'Trim the fat, hon. Lean reads lovelier.'],
  'simpler-word': [() => 'Fancy talk, cool it down!', () => 'Darling, you don’t need big words to impress me.', () => 'So formal. Loosen your tie a little.'],
  'sticky-sentence': [() => 'Gloopy!', () => 'Sticky, hon. Too much glue, not enough flavour.', () => 'This one clings. Peel off a few little words.'],
  redundancy: [() => 'Double helping, hon.', () => 'You said it twice, darling. Once was plenty.', () => 'Saying it again won’t make me like it more.'],
};

/** What the issue's character says about it. The same issue always gets the same line, so nothing shuffles as the page changes. */
export function remark(issue: Issue, word: string): string {
  const owner = ownerOf(issue);
  if (owner === 'sam') {
    if (issue.rule === 'name') return pick(SAM_NAME, word)(issue.suggestions[0] ?? 'they');
    if (/apostrophe|doesn’t/.test(issue.message)) return pick(SAM_APOSTROPHE, word);
    return pick(SAM_WORD, word)(word);
  }
  if (owner === 'pete') {
    const tail = pick(PETE_TAIL, `${issue.rule}:${word}`);
    if (issue.rule === 'unclosed-quote') return `Punctuation! You opened a quote and walked off. Close it.${tail}`;
    if (issue.rule === 'stray-capitals') return `Capitals! “${word}” has its big letters in the wrong place.${tail}`;
    const own = PETE[issue.rule]?.(word, issue.suggestions[0], issue.message);
    return `${own ?? `Grammar! ${issue.message}`}${tail}`;
  }
  const lines = SALLY_ON[issue.rule];
  if (lines) {
    const line = pick(lines, word)(word);
    // Harper's own suggestions say what to change; Sally's words come first.
    return issue.rule === 'harper-style' || issue.rule === 'simpler-word' || issue.rule === 'sticky-sentence' || issue.rule === 'redundancy' ? `${line} ${issue.message}` : line;
  }
  return `${pick(SALLY_ON['harper-style']!, word)(word)} ${issue.message}`;
}

/** One step on a seasoning's meter, up to a reading, and the things the seasoning says there. */
export interface Taste {
  level: string;
  upTo: number;
  says: readonly string[];
}

/**
 * How hard the page is to read, as heat. The grade is the Automated
 * Readability Index. Most published fiction lands between grades 5 and 9,
 * peaking around 7, so Medium covers that peak; each step hotter is a
 * further stretch out along the curve. The old sweet levels fall as: warm
 * honey (6 and under) is Mild to Medium, smooth (7 to 9) is Medium to Hot,
 * chewy (10 and up) is Hot to Inferno.
 */
export const SPICE: Taste[] = [
  {
    level: 'Mild',
    upTo: 4,
    says: [
      'Smooth and easy, darling. You go down like warm honey.',
      'Mild? Sweetheart, I like a little more heat.',
      'So gentle. Kiss it with one longer sentence, would you?',
      'Easy reading. Comfortable. A little too comfortable, hon.',
      'Soft as a whisper. Lovely… now turn the flame up a touch.',
      'Butter wouldn’t melt. Shame. I like things melting.',
    ],
  },
  {
    level: 'Medium',
    upTo: 7,
    says: [
      'Just the right kick, darling. Don’t change a thing.',
      'Ooh, medium. Warm enough to hold my attention.',
      'Now that’s a page I could get comfortable with.',
      'Balanced, smooth, a little bite. You know what I like.',
      'Perfectly seasoned. I could read you all night.',
      'Readable and a little dangerous. Just my type.',
    ],
  },
  {
    level: 'Hot',
    upTo: 9,
    says: [
      'A few long sentences are burning, hon. Hot, but careful.',
      'Getting steamy in here. Shorten one before somebody faints.',
      'Some of these sentences need to come up for air.',
      'Spicy! I like it, but your reader may need a glass of water.',
      'Hot stuff. Just trim the longest ones, sugar.',
      'Mm, warm. Bordering on bothered.',
    ],
  },
  {
    level: 'Extra hot',
    upTo: 12,
    says: [
      'Extra hot, darling. Break a few up before they boil over.',
      'Phew. These sentences go on longer than my last romance.',
      'Too much, too long, too fast. Slow down and let them breathe.',
      'You’re making me sweat, and not the fun way. Shorter sentences.',
      'Honey, the reader is begging for a full stop.',
      'Sizzling. Also exhausting. Pick one.',
    ],
  },
  {
    level: 'Inferno',
    upTo: Infinity,
    says: [
      'Inferno! My tongue’s on fire, and not in a fun way.',
      'Darling, this is a five-alarm page. Shorter sentences, quick.',
      'Somebody call the fire brigade. A handsome one, ideally.',
      'Too hot to handle, even for me. And I handle a lot.',
      'I adore heat, but this is arson. Chop, chop.',
      'Burning, burning, burnt. Cool it with a few full stops.',
    ],
  },
];

export function spiceOf(grade: number): number {
  return tasteOf(SPICE, grade);
}

/** Where a reading falls on a meter, as an index into its steps. */
export function tasteOf(steps: readonly Taste[], value: number): number {
  const at = steps.findIndex((s) => value <= s.upTo);
  return at === -1 ? steps.length - 1 : at;
}

/**
 * Each seasoning's meter: the names of its Check and Report, the words at
 * either end, its five steps, and what it says before there is enough page to
 * read. Sam and Pete read slips per 1,000 words, so a long Item and a short
 * one are judged alike (a slip every 100 words is 10 per 1,000); Daniel reads
 * the share of words spoken; Sally reads the grade level.
 *
 * Every step has several lines, so a seasoning seldom says the same thing
 * twice: Salty Sam is an old sailor, Peppery Pete is sweetly passive-aggressive,
 * Spicy Sally flirts and quips, and Drunk Daniel is exactly what he sounds like.
 */
export interface Meter {
  /** The meter's own word for what it measures, for screen readers. */
  measure: string;
  check: string;
  report: string;
  ends: [string, string];
  steps: Taste[];
  waiting: readonly string[];
}

export const METERS: Record<SeasoningId, Meter> = {
  sam: {
    measure: 'Saltiness',
    check: 'Salt Check',
    report: 'Salt Report',
    ends: ['Unsalted', 'Seawater'],
    steps: [
      {
        level: 'Unsalted',
        upTo: 0,
        says: [
          'Not a speck of salt on her. Shipshape, sailor.',
          'Clean as a scrubbed deck. Nothing to bark about, and I hate that.',
          'Not one word adrift. Who taught you to spell, the Admiralty?',
          'Spotless. I’ll go and sulk in the crow’s nest.',
          'Every word in its bunk. Carry on, deckhand.',
          'Shipshape and Bristol fashion. Don’t let it go to your head.',
        ],
      },
      {
        level: 'A pinch',
        upTo: 10,
        says: [
          'A pinch of brine here and there. Swab it and we sail.',
          'One or two barnacles on the hull. Scrape ’em off.',
          'A couple of words took on water. Bail ’em out.',
          'Mostly seaworthy. Mostly.',
          'A few loose lines on deck. Coil ’em before someone trips.',
          'Light chop. Nothing a sharp eye can’t handle.',
        ],
      },
      {
        level: 'Salty',
        upTo: 25,
        says: [
          'Salty enough to cure a herring. Get scrubbing.',
          'Your spelling’s listing to port, sailor.',
          'I’ve seen tidier logs from a drunk bosun. Fix ’em.',
          'Words overboard! Throw ’em a line.',
          'Barnacles all down the hull. Fetch the scraper.',
          'Choppy water, mate. Hold the wheel steady and fix these.',
        ],
      },
      {
        level: 'Briny',
        upTo: 50,
        says: [
          'Briny as the bilge. I’d not eat off this page.',
          'Blow me down, that’s a lot of misspellings.',
          'She’s taking on water fast. All hands to the dictionary!',
          'This log reads like it was written in a squall. Blindfolded.',
          'By Neptune’s beard, did you type this with your elbows?',
          'Half the words are swimming. The other half are drowning.',
        ],
      },
      {
        level: 'Seawater',
        upTo: Infinity,
        says: [
          'Abandon ship! The spelling’s sunk.',
          'Pure seawater. You could pickle a whale in this page.',
          'Mayday, mayday. Words lost at sea, all hands.',
          'I’ve seen shipwrecks with better spelling. Actual shipwrecks.',
          'Thunder and barnacles! Did a gull write this?',
          'Davy Jones wouldn’t take this page. Too salty even for him.',
        ],
      },
    ],
    waiting: ['Empty deck, sailor. Write something I can holler at.', 'Nothing in the log yet. I’m waiting, and I’m not a patient man.', 'Calm seas and a blank page. Boring. Write.'],
  },
  pete: {
    measure: 'Pepperiness',
    check: 'Pepper Check',
    report: 'Pepper Report',
    ends: ['Plain', 'Smoking'],
    steps: [
      {
        level: 'Plain',
        upTo: 0,
        says: [
          'Oh. No mistakes. How… nice for you.',
          'Clean grammar. I’ll just be over here, unneeded.',
          'Not a single slip. Congratulations, I suppose. Fine. Congratulations.',
          'Perfect. I’m not jealous. Why would I be jealous?',
          'Nothing to fix. I had a whole speech ready, too.',
          'Wow, it’s almost as if you read it back. Almost.',
        ],
      },
      {
        level: 'Peppered',
        upTo: 10,
        says: [
          'Just a sprinkle of slips. No pressure, but I did notice.',
          'A couple of little things. Not that I’m counting. I am counting.',
          'Mostly lovely. I’m sure the slips were on purpose. Were they?',
          'Only a few. I won’t say anything. I’m saying something, but quietly.',
          'Nearly there! “Nearly” is doing a lot of work, but still.',
          'A dash of pepper. I’ll pretend I didn’t see it. I saw it.',
        ],
      },
      {
        level: 'Peppery',
        upTo: 25,
        says: [
          'A few sentences need tidying. Not to be dramatic.',
          'Some slips here. I’m sure you were busy. With… things.',
          'Per my last underline, these still need fixing.',
          'Interesting choices. Wrong, grammatically, but interesting.',
          'I’ve flagged a few. Gently. Like a friend. A friend who’s right.',
          'No, it’s fine. It’s fine. It’s just that it isn’t fine.',
        ],
      },
      {
        level: 'Fiery',
        upTo: 50,
        says: [
          'The grammar’s starting to sting. Just flagging. Again.',
          'Bold of you to ignore the rules this many times.',
          'I’m not angry. I’m sneezing. From all the pepper.',
          'As discussed, verbs agree with their subjects. As. Discussed.',
          'So we’re just… not doing agreement any more? Okay.',
          'Love the energy. Hate the grammar.',
        ],
      },
      {
        level: 'Smoking',
        upTo: Infinity,
        says: [
          'Smoking! Someone open a window. And a grammar book.',
          'I’m sure an editor will love fixing all this. For a fee.',
          'I’d say “no offence”, but honestly? Some offence.',
          'More slips than a banana factory. Just saying.',
          'Wow. Okay. I’ll start at the top and hope for the best.',
          'Per my last several hundred underlines…',
        ],
      },
    ],
    waiting: ['Nothing to judge yet. Not that I judge. I assess.', 'An empty page. Hard to get anything wrong on that, I suppose.', 'Write a sentence. I’ll be here. Waiting. Patiently. Ish.'],
  },
  daniel: {
    measure: 'Drunkenness',
    check: 'Drunk Check',
    report: 'Drunk Report',
    ends: ['Sober', 'Drunk'],
    steps: [
      {
        level: 'Sober',
        upTo: 10,
        says: [
          'Shhh. Nobody’s talking. Is this… a library? Hic.',
          'Too quiet. Someone say something, I’m sobering up.',
          'Barely a word out loud. I’m drying out over here.',
          'Walk, walk, walk. Where’s the talk? I came for the talk.',
          'Sober as a judge. Worst feeling in the world. Hic.',
          'Everyone’s thinking, nobody’s drinking. Talking. I meant talking.',
        ],
      },
      {
        level: 'Sipping',
        upTo: 30,
        says: [
          'Mostly walk, a little talk. I’ll have another, thanks.',
          'A few voices. Just a sip. Pour a bit more, go on.',
          'Tipsy-adjacent. Somebody tell a story. Out loud. Please.',
          'Some chatting. Nice. Nicer with more chatting. Hic.',
          'A wee bit of dialogue. Like a wee drink. Never just the one.',
          'Quiet crowd. I’ll warm ’em up. Who wants a toast?',
        ],
      },
      {
        level: 'Tipsy',
        upTo: 50,
        says: [
          'A nice mix of talk and walk. Cheers to that! Hic.',
          'Perfect balance. Like me on a bar stool. Sort of.',
          'Talky and walky in equal measure. I love you, you know that?',
          'Just right, just right. Have I said that? Just right.',
          'Half and half, like my… where was I? Lovely page.',
          'Good company, this page. Good company. Another round!',
        ],
      },
      {
        level: 'Merry',
        upTo: 70,
        says: [
          'Chatty one! Mostly talk… hic. Lovely. Love it. Love you.',
          'Everybody’s talking! It’s a party and I wasn’t even invited.',
          'Merry, merry, merry. Who’s buying? Your characters are.',
          'Now we’re talking. Literally. Hic.',
          'So much chatter! Pass me a drink and a line.',
          'Gabby gabby gab. My kind of people.',
        ],
      },
      {
        level: 'Drunk',
        upTo: Infinity,
        says: [
          'All talk! Now that’s a party.',
          'Talk talk talk talk… hic… did anyone walk anywhere? No? Good.',
          'Wall-to-wall dialogue. I can’t feel my face. Wonderful.',
          'So loud in here! I love it. Who are all these people?',
          'Nothing but chatter, like last orders at the pub.',
          'Drunk on dialogue. Also on… never mind. Hic.',
        ],
      },
    ],
    waiting: ['Nobody’s said a thing yet. Pour me a line.', 'Empty room, empty glass. Write someone talking.', 'Hellooo? Anyone in? Hic. Say something.'],
  },
  sally: {
    measure: 'Spice',
    check: 'Spice Check',
    report: 'Spice Report',
    ends: ['Mild', 'Inferno'],
    steps: SPICE,
    waiting: ['A paragraph or two and I’ll tell you how hot you run.', 'Don’t be shy, darling. Write a little more for me.', 'I need more than this to get warmed up.'],
  },
};

/**
 * What a seasoning says about where its meter stands. The line is picked by
 * a seed and the reading, so it holds still while the reading does and moves
 * on when the reading changes or the panel is opened again.
 */
export function meterRemark(id: SeasoningId, at: number, seed = 0): string {
  return pick(METERS[id].steps[at]!.says, mix(seed, at));
}

/** What a seasoning says while there is too little page to read. */
export function waitingRemark(id: SeasoningId, seed = 0): string {
  return pick(METERS[id].waiting, mix(seed, 99));
}

/** One line from a few, by seed; for report actions with several ways of saying the same thing. */
export function oneOf<T>(seed: number, lines: readonly T[]): T {
  return lines[mix(seed) % lines.length]!;
}

/** Slips per 1,000 words, so a long Item and a short one are judged alike. */
export function perThousand(slips: number, words: number): number {
  return words > 0 ? Math.round((slips * 1000) / words) : 0;
}

/** The issue kind each seasoning underlines on the page. Daniel underlines nothing; his Check dims narration. */
export const KIND_OF: Partial<Record<SeasoningId, 'spelling' | 'grammar' | 'style'>> = { sam: 'spelling', pete: 'grammar', sally: 'style' };

/** How a fix reads beside its button. */
export function fixText(problem: string, fix: string): string {
  if (fix === '') return problem.trim() ? `cut “${problem.trim()}”` : 'remove the space';
  if (fix.trim() === '') return fix.length === 1 ? 'one space' : 'spaces';
  return fix;
}
