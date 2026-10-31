import { type Node as PMNode } from '@tiptap/pm/model';
import { dialogueRanges } from '../editor/dialogue';
import { type NameMatcher, findNames } from '../editor/names';
import { type TextMap, textMap, toRange } from '../editor/textmap';
import { countWords } from '../storage/index';
import { words } from './check';
import { type FoundIssue } from './plugin';
import { METERS, type SeasoningId, SEASONINGS, meterRemark, mix, oneOf, perThousand, remark, spiceOf, tasteOf, waitingRemark } from './remarks';
import { GLUE, NOT_ADVERBS, STYLE_RULES, readingGrade, sentences } from './style';

/**
 * The Seasonings reports: a fuller look at the open Item than the meters
 * give, one per seasoning and in its voice, after ProWritingAid's summary.
 * Each is worked out once, when it is opened, from the page and the
 * underlines already on it; nothing here runs while the writer types.
 */

/** A stretch of the page, in document positions, to jump to. */
export interface Spot {
  from: number;
  to: number;
}

/** A row in a report: what it is, how many, and where. */
export interface Row {
  label: string;
  /** Shown after the label, quieter. */
  detail?: string;
  count?: number;
  /** The words around it, with the part in question marked. */
  context?: { before: string; hit: string; after: string };
  spots: Spot[];
}

export type Section =
  | { kind: 'rows'; title: string; note?: string; rows: Row[]; empty: string }
  | { kind: 'bars'; title: string; note?: string; bars: { label: string; value: number; detail?: string }[]; empty: string }
  /** One cell per paragraph: how much of it is spoken, from 0 to 1, or null with no words. */
  | { kind: 'strip'; title: string; note?: string; cells: { share: number | null; words: number; spot: Spot }[]; empty: string };

export interface Report {
  id: SeasoningId;
  title: string;
  /** Where the meter stands, as on the card; null with too little page to read. */
  reading: { at: number; detail: string } | null;
  /** The character's verdict, first line in their voice. */
  verdict: string;
  stats: { label: string; value: string }[];
  /** "Try this first": up to three things to do, in the character's voice. */
  actions: string[];
  sections: Section[];
}

export interface ReportInput {
  doc: PMNode;
  /** The underlines on the page, as issuesOf gives them. */
  issues: FoundIssue[];
  /** Linked story names, for who is talking. */
  names?: NameMatcher | null;
  /** Picks among the many ways each seasoning can say a thing, so no two reports read alike. */
  seed?: number;
}

interface Para {
  text: string;
  map: TextMap;
  words: number;
}

/** The page's text blocks, each with its text and where every character sits. */
function parasOf(doc: PMNode): Para[] {
  const out: Para[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const map = textMap(node, pos);
    out.push({ text: map.text, map, words: countWords(map.text) });
    return false;
  });
  return out;
}

/** A spot from character offsets in a paragraph. */
const spotIn = (p: Para, from: number, to: number): Spot => (to > from ? toRange(p.map, from, to) : { from: p.map.positions[from] ?? 0, to: p.map.positions[from] ?? 0 });

const AROUND = 40;
/**
 * Rows that get the words around them quoted. The window shows 100 rows before "Show all",
 * and quoting thousands on a long Item would only slow the report down.
 */
export const QUOTED_ROWS = 100;

/** A few words either side, cut at spaces, with the part in question marked. */
function contextOf(doc: PMNode, spot: Spot): Row['context'] {
  if (spot.to > doc.content.size) return undefined;
  const $from = doc.resolve(spot.from);
  if (!$from.parent.isTextblock) return undefined;
  const start = Math.max($from.start(), spot.from - AROUND);
  const end = Math.min($from.end(), spot.to + AROUND);
  let before = doc.textBetween(start, spot.from, ' ', ' ');
  if (start > $from.start()) before = `…${before.replace(/^\S*\s/, '')}`;
  let after = doc.textBetween(spot.to, end, ' ', ' ');
  if (end < $from.end()) after = `${after.replace(/\s\S*$/, '')}…`;
  return { before, hit: doc.textBetween(spot.from, spot.to, ' ', ' '), after };
}

/** The opening words of a paragraph or sentence, for naming it. */
const opening = (text: string, n = 6) => {
  const ws = text.trim().split(/\s+/);
  return ws.length > n ? `${ws.slice(0, n).join(' ')}…` : text.trim();
};

const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString('en')} ${n === 1 ? word : many}`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Groups items by a key, keeping first-seen order, most frequent first. */
function grouped<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const t of items) {
    const k = key(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  return [...map].sort((a, b) => b[1].length - a[1].length);
}

const spotOf = (i: FoundIssue): Spot => ({ from: i.from, to: i.to });

function verdictOf(id: SeasoningId, reading: Report['reading'], seed: number): string {
  return reading ? meterRemark(id, reading.at, seed) : waitingRemark(id, seed);
}

/** One of several ways of saying the same thing, picked by the report's seed and which thing it is. */
const sayer = (seed: number) => (which: number, lines: readonly string[]) => oneOf(mix(seed, which), lines);

// ---------- Salty Sam: spelling ----------

export function saltReport({ doc, issues, seed = 0 }: ReportInput): Report {
  const say = sayer(seed);
  const paras = parasOf(doc);
  const total = paras.reduce((n, p) => n + p.words, 0);
  const slips = issues.filter((i) => i.issue.kind === 'spelling');
  const names = slips.filter((i) => i.issue.rule === 'name');
  const plain = slips.filter((i) => i.issue.rule !== 'name');
  const per = perThousand(slips.length, total);
  const reading = total > 0 ? { at: tasteOf(METERS.sam.steps, per), detail: `${plural(slips.length, 'spelling slip')} · ${per} per 1,000 words` } : null;
  const byWord = grouped(plain, (i) => i.word.toLowerCase());
  const repeats = byWord.filter(([, list]) => list.length > 1);
  const byName = grouped(names, (i) => i.word);

  const actions: string[] = [];
  if (repeats[0]) {
    const w = repeats[0][1][0]!.word;
    const n = plural(repeats[0][1].length, 'time');
    actions.push(
      say(1, [
        `Fix “${w}” first. It turns up ${n}, so one fix does the lot.`,
        `“${w}” is fouling the anchor ${n} over. Cut it loose first.`,
        `Same leak ${n}: “${w}”. Plug it once and she’ll float.`,
        `Start with “${w}”, sailor. ${n} wrong, and every one of ’em the same.`,
      ]),
    );
  }
  if (byName[0]) {
    const w = byName[0][0];
    const right = byName[0][1][0]!.issue.suggestions[0] ?? 'one of your crew';
    actions.push(
      say(2, [
        `“${w}”? Pretty sure you mean ${right}. Check their Pantry card.`,
        `You’ve gone and called ${right} “${w}”. They’ll have words with you.`,
        `“${w}” isn’t on my crew list. ${right} is. Fix it before there’s a mutiny.`,
      ]),
    );
  }
  if (plain.length > 0)
    actions.push(
      say(3, [
        'A word I don’t know but you do, like a place or a made-up word? Right-click it and add it to the dictionary, and I’ll stop nagging.',
        'Foreign port names and made-up words go in the dictionary. Right-click ’em and I’ll stop squawking.',
        'If I’ve flagged a word you invented, right-click it and add it to the dictionary. I don’t do fiction, sailor.',
      ]),
    );
  if (slips.length === 0 && total > 0)
    actions.push(
      say(4, ['Not a grain out of place. Go and salt the next Item.', 'Nothing to swab. Hoist the sails and write on.', 'Clean deck. I’m off to find someone worse at spelling. Won’t take long.']),
    );

  return {
    id: 'sam',
    title: METERS.sam.report,
    reading,
    verdict: verdictOf('sam', reading, seed),
    stats: [
      { label: 'Spelling slips', value: slips.length.toLocaleString('en') },
      { label: 'Per 1,000 words', value: String(per) },
      { label: 'Different words', value: byWord.length.toLocaleString('en') },
      { label: 'Name slips', value: names.length.toLocaleString('en') },
    ],
    actions: actions.slice(0, 3),
    sections: [
      {
        kind: 'rows',
        title: 'Repeat offenders',
        note: 'Words spelt wrong more than once. Fix the first and the rest are easy to spot.',
        rows: repeats.map(([, list]) => ({ label: list[0]!.word, count: list.length, spots: list.map(spotOf) })),
        empty: 'No word is wrong twice. Each slip is a one-off.',
      },
      {
        kind: 'rows',
        title: 'Story names',
        note: 'Near misses of the names on your Pantry cards.',
        rows: byName.map(([word, list]) => ({ label: word, detail: list[0]!.issue.suggestions[0] ? `→ ${list[0]!.issue.suggestions[0]}` : undefined, count: list.length, spots: list.map(spotOf) })),
        empty: 'Every name is spelt the way its owner spells it.',
      },
      {
        kind: 'rows',
        title: 'Every slip',
        rows: plain.map((i, n) => ({ label: i.word, context: n < QUOTED_ROWS ? contextOf(doc, spotOf(i)) : undefined, spots: [spotOf(i)] })),
        empty: 'Nothing to show. Clean as a scrubbed deck.',
      },
    ],
  };
}

// ---------- Peppery Pete: grammar ----------

/** How Pete's heading for a kind of slip reads inside a sentence: "the doubled-word slips", not "the twice slips". */
const SLIP_NAME: Record<string, string> = {
  Twice: 'doubled-word',
  Capitals: 'capital-letter',
  'Verb form': 'verb-form',
  'Wrong case': 'pronoun',
  'Word order': 'word-order',
  'Double helping': 'double-helping',
  'Mix-up': 'mix-up',
};

/** Pete's name for a slip: the word before the "!" in what he says about it. */
function troubleOf(i: FoundIssue): { kind: string; says: string } {
  const said = remark(i.issue, i.word);
  const m = /^([^!]{2,24})! (.*)$/s.exec(said);
  return m ? { kind: m[1]!, says: m[2]! } : { kind: 'Grammar', says: said };
}

export function pepperReport({ doc, issues, seed = 0 }: ReportInput): Report {
  const say = sayer(seed);
  const paras = parasOf(doc);
  const total = paras.reduce((n, p) => n + p.words, 0);
  const slips = issues.filter((i) => i.issue.kind === 'grammar');
  const per = perThousand(slips.length, total);
  const reading = total > 0 ? { at: tasteOf(METERS.pete.steps, per), detail: `${plural(slips.length, 'grammar slip')} · ${per} per 1,000 words` } : null;
  const byKind = grouped(slips, (i) => troubleOf(i).kind);

  // Which paragraphs have slips, and the worst of them.
  const ends: number[] = paras.map((p) => (p.map.positions.length > 0 ? p.map.positions[p.map.positions.length - 1]! + 1 : 0));
  const paraOf = (pos: number) => ends.findIndex((end) => pos < end);
  const perPara = new Map<number, number>();
  for (const s of slips) {
    const at = paraOf(s.from);
    perPara.set(at, (perPara.get(at) ?? 0) + 1);
  }
  const written = paras.filter((p) => p.words > 0).length;
  const clean = written - [...perPara.keys()].filter((k) => k >= 0 && paras[k]!.words > 0).length;
  const worst = [...perPara].sort((a, b) => b[1] - a[1])[0];

  const actions: string[] = [];
  if (byKind[0]) {
    const kind = SLIP_NAME[byKind[0][0]] ?? byKind[0][0].toLowerCase();
    const n = byKind[0][1].length;
    const count = n === 1 ? 'one' : String(n);
    actions.push(
      say(1, [
        `Start with the ${kind} slips. There ${n === 1 ? 'is one' : `are ${n}`}, more than anything else.`,
        `Maybe look at the ${kind} slips first? Only ${count} of them. Only.`,
        `Not to nag, but the ${kind} slips are winning. ${count} of them, at last count.`,
        `If you do one thing today, and I’m not saying you will, fix the ${count} ${kind} slips.`,
      ]),
    );
  }
  if (worst && worst[1] >= 3 && paras[worst[0]]) {
    const where = opening(paras[worst[0]]!.text);
    actions.push(
      say(2, [
        `The paragraph starting “${where}” has ${worst[1]} slips. Give it a once-over.`,
        `“${where}” has ${worst[1]} slips in one paragraph. Impressive, in its way.`,
        `I’ve circled the paragraph starting “${where}”. ${worst[1]} times. Lovingly.`,
      ]),
    );
  }
  if (slips.length > 0)
    actions.push(
      say(3, [
        'Click any underline on the page for my fix. F7 takes you to the next one.',
        'My fixes are one click away on each underline. You’re welcome, in advance.',
        'F7 walks you from slip to slip. I made it easy. You’re welcome.',
      ]),
    );
  if (slips.length === 0 && total > 0)
    actions.push(
      say(4, ['Clean grammar. Nothing to grind. Off you go.', 'No notes. Which is a note, really. A good one. Fine.', 'Nothing for me here. I’ll just… go and check someone else’s.']),
    );

  return {
    id: 'pete',
    title: METERS.pete.report,
    reading,
    verdict: verdictOf('pete', reading, seed),
    stats: [
      { label: 'Grammar slips', value: slips.length.toLocaleString('en') },
      { label: 'Per 1,000 words', value: String(per) },
      { label: 'Kinds of slip', value: String(byKind.length) },
      { label: 'Clean paragraphs', value: `${pct(clean, written)}%` },
    ],
    actions: actions.slice(0, 3),
    sections: [
      {
        kind: 'bars',
        title: 'Slips by kind',
        bars: byKind.map(([kind, list]) => ({ label: kind, value: list.length })),
        empty: 'Not a single slip to sort.',
      },
      ...byKind.map(([kind, list]): Section => ({
        kind: 'rows',
        title: kind,
        rows: list.map((i, n) => ({ label: i.word, detail: troubleOf(i).says, context: n < QUOTED_ROWS ? contextOf(doc, spotOf(i)) : undefined, spots: [spotOf(i)] })),
        empty: '',
      })),
    ],
  };
}

// ---------- Drunk Daniel: dialogue ----------

const TAGS = new Set(
  'said says say asked asks ask told tells replied replies answered answers whispered whispers shouted shouts yelled yells muttered mutters murmured murmurs exclaimed cried cries called calls snapped hissed growled retorted snarled barked sighed laughed chuckled giggled sneered gasped breathed purred demanded insisted added continued admitted agreed protested pleaded begged whimpered stammered stuttered roared bellowed screamed grumbled groaned moaned quipped declared announced remarked observed interjected mumbled drawled chirped spat croaked rasped teased offered warned suggested'.split(' '),
);
/** The tags that disappear on the page; the rest draw attention to themselves. */
const PLAIN_TAGS = new Set('said says say asked asks ask told tells'.split(' '));
/** How far either side of a speech a tag can sit. */
const TAG_REACH = 48;

interface Tag {
  verb: string;
  adverb: string | null;
  spot: Spot;
  speaker: string | null;
}

/** The dialogue tags in a paragraph: a speech verb just after or just before a quote, with any -ly word beside it. */
function tagsIn(p: Para, speech: [number, number][], names: NameMatcher | null | undefined): Tag[] {
  const out: Tag[] = [];
  const taken = new Set<number>();
  const inSpeech = (at: number) => speech.some(([a, b]) => at >= a && at < b);
  for (const [a, b] of speech) {
    for (const [from, to] of [
      [b, Math.min(p.text.length, b + TAG_REACH)],
      [Math.max(0, a - TAG_REACH), a],
    ] as const) {
      if (to <= from) continue;
      const ws = words(p.text.slice(from, to)).map((w) => ({ ...w, from: w.from + from, to: w.to + from }));
      const at = ws.findIndex((w) => TAGS.has(w.word.toLowerCase()) && !inSpeech(w.from));
      if (at === -1) continue;
      const w = ws[at]!;
      if (taken.has(w.from)) continue;
      taken.add(w.from);
      const near = [ws[at + 1], ws[at - 1], ws[at + 2]].find((n) => n && /ly$/i.test(n.word) && n.word.length > 4 && !NOT_ADVERBS.has(n.word.toLowerCase()) && !inSpeech(n.from));
      const window = p.text.slice(Math.max(from, w.from - 24), Math.min(to, w.to + 24));
      const speaker = findNames(window, names ?? null)[0]?.card.title ?? null;
      out.push({ verb: w.word.toLowerCase(), adverb: near ? near.word : null, spot: spotIn(p, w.from, (near && near.from > w.from ? near.to : w.to)), speaker });
      break;
    }
  }
  return out;
}

export function drunkReport({ doc, names, seed = 0 }: ReportInput): Report {
  const say = sayer(seed);
  const paras = parasOf(doc);
  let all = 0;
  let spoken = 0;
  let speeches = 0;
  let longest: { words: number; spot: Spot; text: string } | null = null;
  const cells: { share: number | null; words: number; spot: Spot }[] = [];
  const tags: Tag[] = [];
  let dry: { words: number; from: number; to: number } | null = null;
  let run: { words: number; from: number; to: number } | null = null;
  paras.forEach((p, i) => {
    const speech = dialogueRanges(p.text);
    let mine = 0;
    for (const [a, b] of speech) {
      const n = countWords(p.text.slice(a, b));
      mine += n;
      speeches++;
      if (!longest || n > longest.words) longest = { words: n, spot: spotIn(p, a, b), text: p.text.slice(a, b) };
    }
    all += p.words;
    spoken += mine;
    const whole = p.text.length > 0 ? spotIn(p, 0, p.text.length) : spotIn(p, 0, 0);
    if (p.words > 0) cells.push({ share: mine / p.words, words: p.words, spot: whole });
    tags.push(...tagsIn(p, speech, names));
    // The longest run of paragraphs where nobody says a word.
    if (p.words > 0 && speech.length === 0) {
      run = run ? { ...run, words: run.words + p.words, to: i } : { words: p.words, from: i, to: i };
      if (!dry || run.words > dry.words) dry = { ...run };
    } else if (p.words > 0) run = null;
  });
  const share = pct(spoken, all);
  const reading = all > 0 ? { at: tasteOf(METERS.daniel.steps, share), detail: `${share}% dialogue · ${100 - share}% narration` } : null;
  const fancy = tags.filter((t) => !PLAIN_TAGS.has(t.verb));
  const adverbs = tags.filter((t) => t.adverb);
  const bySpeaker = grouped(tags.filter((t) => t.speaker), (t) => t.speaker!);
  const dryRun = dry as { words: number; from: number; to: number } | null;
  const longestSpeech = longest as { words: number; spot: Spot; text: string } | null;

  const actions: string[] = [];
  if (dryRun && dryRun.words >= 300) {
    const n = dryRun.words.toLocaleString('en');
    const where = opening(paras[dryRun.from]!.text);
    actions.push(
      say(1, [
        `Nobody says a word for ${n} words from “${where}”. Let someone pipe up. Hic.`,
        `${n} words of silence from “${where}”. I nearly sobered up. Somebody talk!`,
        `From “${where}”, ${n} words and not a peep. Who died? Hic. Sorry.`,
      ]),
    );
  }
  if (fancy.length >= 3 && fancy.length * 3 > tags.length)
    actions.push(
      say(2, [
        `Easy on the fancy tags: ${fancy.length} of your ${tags.length} aren’t “said” or “asked”. “Said” goes down smooth.`,
        `${fancy.length} fancy tags! Everyone’s hissing and growling. Just say “said”, mate. Hic.`,
        `So much snapping and muttering. Have a “said”. It’s like water. Not that I’d know.`,
      ]),
    );
  if (adverbs[0]) {
    const tag = `${adverbs[0].verb} ${adverbs[0].adverb}`;
    actions.push(
      say(3, [`“${tag}”: let the line itself do the work and drop the -ly.`, `“${tag}”? The line should say how it’s said. Lose the -ly. Hic.`, `“${tag}”. One -ly too many, like my last drink.`]),
    );
  }
  if (all > 300 && share < 10)
    actions.push(say(4, ['Quiet as a library in here. A line or two out loud would liven it up.', 'Not a word spoken. I’ve been to livelier funerals. Hic.', 'Let somebody talk! I’m begging. My glass is empty.']));
  if (share > 70)
    actions.push(say(5, ['All talk, my favourite! Give the reader a look at the room between the lines.', 'Love the chatter, but where are we? A pub? Please say a pub.', 'Everyone’s talking, nobody’s moving. Let ’em pour a drink or something. Hic.']));
  if (actions.length === 0 && all > 0) actions.push(say(6, ['Talk and walk in good measure. Pour yourself one. Cheers!', 'Nothing to fix. Lovely. Lovely page. I’m a bit emotional. Hic.', 'Perfectly balanced, like me. Mostly. Cheers!']));

  return {
    id: 'daniel',
    title: METERS.daniel.report,
    reading,
    verdict: verdictOf('daniel', reading, seed),
    stats: [
      { label: 'Spoken', value: `${share}%` },
      { label: 'Speeches', value: speeches.toLocaleString('en') },
      { label: 'Dialogue tags', value: tags.length.toLocaleString('en') },
      { label: 'Fancy tags', value: fancy.length.toLocaleString('en') },
    ],
    actions: actions.slice(0, 3),
    sections: [
      {
        kind: 'strip',
        title: 'Talk and walk',
        note: 'One bar per paragraph, in order: the taller it is, the more of it is spoken. Click one to go there.',
        cells,
        empty: 'Nothing written yet.',
      },
      {
        kind: 'bars',
        title: 'Who talks',
        note: 'Speeches tagged with a name from your Pantry.',
        bars: bySpeaker.map(([who, list]) => ({ label: who, value: list.length })),
        empty: 'No tagged speeches name anyone on a Pantry card yet.',
      },
      {
        kind: 'rows',
        title: 'Fancy tags',
        note: '“Said” and “asked” vanish on the page. These don’t.',
        rows: grouped(fancy, (t) => t.verb).map(([verb, list]) => ({ label: verb, count: list.length, spots: list.map((t) => t.spot) })),
        empty: 'Every tag is a plain “said” or “asked”. Lovely.',
      },
      {
        kind: 'rows',
        title: 'Adverbs on tags',
        rows: adverbs.map((t, n) => ({ label: `${t.verb} ${t.adverb}`, context: n < QUOTED_ROWS ? contextOf(doc, t.spot) : undefined, spots: [t.spot] })),
        empty: 'No -ly words leaning on your tags.',
      },
      {
        kind: 'rows',
        title: 'Longest stretches',
        rows: [
          ...(dryRun ? [{ label: 'Longest quiet stretch', detail: `${plural(dryRun.words, 'word')} with no dialogue, from “${opening(paras[dryRun.from]!.text)}”`, spots: [{ from: spotIn(paras[dryRun.from]!, 0, 0).from, to: spotIn(paras[dryRun.to]!, 0, paras[dryRun.to]!.text.length).to }] }] : []),
          ...(longestSpeech && longestSpeech.words > 0 ? [{ label: 'Longest speech', detail: `${plural(longestSpeech.words, 'word')}: ${opening(longestSpeech.text, 8)}`, spots: [longestSpeech.spot] }] : []),
        ],
        empty: 'Nothing to measure yet.',
      },
    ],
  };
}

// ---------- Spicy Sally: style ----------

const LENGTHS: { label: string; upTo: number }[] = [
  { label: '1–5', upTo: 5 },
  { label: '6–10', upTo: 10 },
  { label: '11–15', upTo: 15 },
  { label: '16–20', upTo: 20 },
  { label: '21–30', upTo: 30 },
  { label: '31+', upTo: Infinity },
];
/** A sentence this long is worth a look whatever the grade. */
const LONG_SENTENCE = 30;
const STYLE_LABEL: Record<string, string> = Object.fromEntries(STYLE_RULES.map((r) => [r.id, r.label]));
/** Sally's lines on each kind of note, for the actions. */
const SALLY_ON: Record<string, ((n: number) => string)[]> = {
  adverb: [(n) => `${plural(n, 'adverb')}. Swap a few for stronger verbs and feel the heat.`, (n) => `${plural(n, 'adverb')}, darling. A strong verb is so much more attractive.`, (n) => `${plural(n, '-ly word')} hanging about. Send some of them home.`],
  'crutch-word': [(n) => `${plural(n, 'crutch word')}. Pull them out and see if the sentence still stands.`, (n) => `${plural(n, 'crutch word')}. Stand up straight, sugar. You look better without them.`, (n) => `${plural(n, 'crutch word')}. Really, hon? Just cut them.`],
  passive: [(n) => `${plural(n, 'passive sentence')}. Tell me who’s doing the doing.`, (n) => `${plural(n, 'passive sentence')}. I like a sentence that takes charge.`, (n) => `${plural(n, 'passive sentence')}. Things “were done”, darling? By whom? Don’t tease.`],
  'sticky-sentence': [(n) => `${plural(n, 'sticky sentence')}. Too much glue, hon. Trim the little words.`, (n) => `${plural(n, 'sticky sentence')}. Clingy isn’t a good look on anyone.`, (n) => `${plural(n, 'sticky sentence')}. Peel a few words off and let them breathe.`],
  echo: [(n) => `${plural(n, 'echo', 'echoes')}. Same spice twice. Swap one of each pair.`, (n) => `${plural(n, 'echo', 'echoes')}, darling. Variety keeps things exciting.`, (n) => `${plural(n, 'echo', 'echoes')}. Charming once, hon. Less so twice.`],
  cliche: [(n) => `${plural(n, 'cliché')}. Stale seasoning. Say it your own way.`, (n) => `${plural(n, 'cliché')}. I’ve heard those lines before, sugar. Surprise me.`, (n) => `${plural(n, 'cliché')}. Be original, darling. It’s far more seductive.`],
  'simpler-word': [(n) => `${plural(n, 'fancy word')}. Cool it down with something plainer.`, (n) => `${plural(n, 'big word')}. You don’t need to impress me, darling. You already do.`, (n) => `${plural(n, 'word')} in a three-piece suit. Loosen the tie.`],
  redundancy: [(n) => `${plural(n, 'double helping')}. Say it once.`, (n) => `${plural(n, 'double helping')}, hon. Once is plenty when it’s good.`, (n) => `${plural(n, 'phrase')} saying it twice. I heard you the first time, darling.`],
};

export function spiceReport({ doc, issues, names, seed = 0 }: ReportInput): Report {
  const say = sayer(seed);
  const paras = parasOf(doc);
  const all: { words: number; p: number; from: number; to: number }[] = [];
  let letters = 0;
  let wordTotal = 0;
  // Where each word is, as paragraph and offsets; turned into page positions only for the words listed.
  const counts = new Map<string, { n: number; at: number[]; shown: string }>();
  const nameWords = new Set([...(names?.byName.keys() ?? [])].flatMap((n) => n.toLowerCase().split(/\s+/)));
  paras.forEach((p, pi) => {
    for (const s of sentences(p.text)) {
      letters += s.letters;
      wordTotal += s.words;
      all.push({ words: s.words, p: pi, from: s.from, to: s.to });
    }
    for (const w of words(p.text)) {
      const lower = w.word.toLowerCase().replace(/’/g, "'");
      if (lower.length < 4 || GLUE.has(lower) || nameWords.has(lower) || !/^\p{L}/u.test(lower)) continue;
      const known = counts.get(lower);
      if (known) {
        known.n++;
        known.at.push(pi, w.from, w.to);
      } else counts.set(lower, { n: 1, at: [pi, w.from, w.to], shown: w.word.toLowerCase() });
    }
  });
  const spotsOf = (at: number[]): Spot[] => {
    const out: Spot[] = [];
    for (let i = 0; i < at.length; i += 3) out.push(spotIn(paras[at[i]!]!, at[i + 1]!, at[i + 2]!));
    return out;
  };
  const grade = readingGrade({ letters, words: wordTotal, sentences: all.length });
  const reading = grade.words >= 50 ? { at: spiceOf(grade.grade), detail: `Grade ${grade.grade}` } : null;
  const notes = issues.filter((i) => i.issue.kind === 'style');
  const byRule = grouped(notes, (i) => i.issue.rule);
  const average = all.length > 0 ? Math.round(wordTotal / all.length) : 0;
  const buckets = LENGTHS.map((b, i) => ({ label: `${b.label} words`, value: all.filter((s) => s.words <= b.upTo && (i === 0 || s.words > LENGTHS[i - 1]!.upTo)).length }));
  const commonest = Math.max(0, ...buckets.map((b) => b.value));
  const long = all.filter((s) => s.words >= LONG_SENTENCE).sort((a, b) => b.words - a.words).map((s) => ({ words: s.words, spot: spotIn(paras[s.p]!, s.from, s.to), text: paras[s.p]!.text.slice(s.from, s.to) }));
  // Words used more than a writer might notice: three times or more, and at least 5 per 1,000.
  const overused = [...counts.values()].filter((c) => c.n >= 3 && perThousand(c.n, wordTotal) >= 5).sort((a, b) => b.n - a.n).slice(0, 10);

  const actions: string[] = [];
  if (long[0]) {
    const where = opening(long[0].text);
    const n = long[0].words;
    actions.push(
      say(1, [
        `Chop the sentence starting “${where}” in two. ${n} words is a mouthful, hon.`,
        `“${where}” goes on for ${n} words. Darling, leave them wanting more.`,
        `${n} words in one breath, starting “${where}”. Even I need a pause.`,
        `Break up “${where}”. ${n} words without a full stop? Tease.`,
      ]),
    );
  }
  if (all.length >= 8 && commonest / all.length >= 0.6)
    actions.push(
      say(2, [
        'Your sentences all taste the same length. Mix a short one in with the long ones.',
        'Every sentence the same length, darling? Keep me guessing.',
        'Same rhythm, over and over. Surprise me with a short one. Like this.',
      ]),
    );
  if (byRule[0]) {
    const n = byRule[0][1].length;
    const lines = SALLY_ON[byRule[0][0]];
    actions.push(lines ? oneOf(mix(seed, 3), lines)(n) : say(3, [`${plural(n, 'note')} on word choice. Have a look, hon.`, `${plural(n, 'little note')} on word choice. Indulge me and read them.`]));
  }
  if (overused[0] && actions.length < 3) {
    const w = overused[0].shown;
    const n = overused[0].n;
    actions.push(say(4, [`“${w}” turns up ${n} times. Find it a friend.`, `“${w}”, ${n} times? Darling, you’re obsessed. Share the love.`, `You keep coming back to “${w}”. ${n} times. Flattering for “${w}”, dull for me.`]));
  }
  if (actions.length === 0 && grade.words > 0) actions.push(say(5, ['Just the right kick. Nothing burning. Serve it up.', 'Nothing to fix, darling. Delicious as it is.', 'I’ve no notes. Rare for me. Don’t get used to it.']));

  return {
    id: 'sally',
    title: METERS.sally.report,
    reading,
    verdict: verdictOf('sally', reading, seed),
    stats: [
      { label: 'Grade', value: grade.words > 0 ? String(grade.grade) : '—' },
      { label: 'Average sentence', value: plural(average, 'word') },
      { label: 'Sentences', value: all.length.toLocaleString('en') },
      { label: 'Style notes', value: notes.length.toLocaleString('en') },
    ],
    actions: actions.slice(0, 3),
    sections: [
      {
        kind: 'bars',
        title: 'Sentence lengths',
        note: 'Good writing mixes them. A tall bar with nothing beside it means every sentence tastes the same.',
        bars: all.length > 0 ? buckets : [],
        empty: 'No sentences yet.',
      },
      {
        kind: 'rows',
        title: 'Longest sentences',
        note: `Sentences of ${LONG_SENTENCE} words or more.`,
        rows: long.slice(0, 5).map((s) => ({ label: opening(s.text, 10), detail: plural(s.words, 'word'), spots: [s.spot] })),
        empty: 'None over the limit. Nicely trimmed.',
      },
      ...byRule.map(([rule, list]): Section => ({
        kind: 'rows',
        title: STYLE_LABEL[rule] ?? 'Word choice',
        rows: grouped(list, (i) => i.word.toLowerCase()).map(([, same]) => ({ label: same[0]!.word.length > 60 ? opening(same[0]!.word, 10) : same[0]!.word, count: same.length, spots: same.map(spotOf) })),
        empty: '',
      })),
      {
        kind: 'rows',
        title: 'Words you lean on',
        note: 'Used three times or more, and at least 5 per 1,000 words. Glue words and story names are left out.',
        rows: overused.map((c) => ({ label: c.shown, count: c.n, detail: `${perThousand(c.n, wordTotal)} per 1,000`, spots: spotsOf(c.at) })),
        empty: 'No word is doing more than its share.',
      },
    ],
  };
}

/** The reports there are, by seasoning. */
export const REPORTS: Partial<Record<SeasoningId, (input: ReportInput) => Report>> = { sam: saltReport, pete: pepperReport, daniel: drunkReport, sally: spiceReport };

// ---------- saving ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A saved report's name: the seasoning, then the day and time, as briefly as
 * reads well: "Salty Sam · 31 Oct ’26 · 15.11". The time takes a full stop,
 * as in British English, because Windows allows no colon in a file name.
 */
export function reportName(id: SeasoningId, when: Date): string {
  const who = SEASONINGS.find((s) => s.id === id)!.name;
  const year = String(when.getFullYear()).slice(-2);
  const time = `${String(when.getHours()).padStart(2, '0')}.${String(when.getMinutes()).padStart(2, '0')}`;
  return `${who} · ${when.getDate()} ${MONTHS[when.getMonth()]} ’${year} · ${time}`;
}

/** Markdown has no way to show some characters plainly inside a table or list. */
const md = (s: string) => s.replace(/([\\`*_[\]|<>#])/g, '\\$1').replace(/\s+/g, ' ').trim();

/** A text bar for a saved report, where the page can't draw one. */
const bar = (value: number, max: number, width = 20) => (max > 0 ? '█'.repeat(Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width))) : '');

/** The report as a Research card's text: what was found, written to keep, without the jump links. */
export function reportMarkdown(report: Report, item: string, when: Date): string {
  const meter = METERS[report.id];
  const out: string[] = [];
  out.push(`*${md(report.verdict)}*`);
  out.push(`On “${md(item || 'Untitled')}”, ${when.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}.`);
  if (report.reading) out.push(`**${md(meter.steps[report.reading.at]!.level)}** on a scale from ${meter.ends[0]} to ${meter.ends[1]}: ${md(report.reading.detail)}.`);
  out.push(report.stats.map((s) => `- **${md(s.label)}:** ${md(s.value)}`).join('\n'));
  if (report.actions.length > 0) out.push(`## Try this first\n\n${report.actions.map((a, i) => `${i + 1}. ${md(a)}`).join('\n')}`);
  for (const s of report.sections) {
    const head = `## ${md(s.title)}${s.note ? `\n\n${md(s.note)}` : ''}`;
    if (s.kind === 'rows') {
      if (s.rows.length === 0) {
        if (s.empty) out.push(`${head}\n\n${md(s.empty)}`);
        continue;
      }
      const lines = s.rows.map((r) => {
        const what = r.context ? `${md(r.context.before)} **${md(r.context.hit)}** ${md(r.context.after)}` : `**${md(r.label)}**`;
        const extra = [r.count && r.count > 1 ? `×${r.count}` : '', r.detail ? md(r.detail) : ''].filter(Boolean).join(' · ');
        return `- ${r.context && r.label !== r.context.hit ? `**${md(r.label)}**: ` : ''}${what}${extra ? ` (${extra})` : ''}`;
      });
      out.push(`${head}\n\n${lines.join('\n')}`);
    } else if (s.kind === 'bars') {
      if (s.bars.length === 0) {
        out.push(`${head}\n\n${md(s.empty)}`);
        continue;
      }
      const max = Math.max(...s.bars.map((b) => b.value));
      out.push(`${head}\n\n| | | |\n| --- | --- | --- |\n${s.bars.map((b) => `| ${md(b.label)} | ${bar(b.value, max)} | ${b.value} |`).join('\n')}`);
    } else {
      if (s.cells.length === 0) {
        out.push(`${head}\n\n${md(s.empty)}`);
        continue;
      }
      // Eight steps of a bar, a character per paragraph, so the shape of the talk shows in plain text.
      const steps = ' ▁▂▃▄▅▆▇█';
      out.push(`${head.replace(/ Click one to go there\./, '')}\n\n\`${s.cells.map((c) => steps[Math.round((c.share ?? 0) * 8)]).join('')}\``);
    }
  }
  return `${out.join('\n\n')}\n`;
}
