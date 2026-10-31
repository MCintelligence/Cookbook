import { type Node as PMNode } from '@tiptap/pm/model';
import { type NameMatcher } from '../editor/names';
import { type TextMap, textMap } from '../editor/textmap';
import { countWords } from '../storage/index';
import { type FoundIssue } from './plugin';
import { METERS, type SeasoningId, SEASONINGS, perThousand, remark, tasteOf } from './remarks';

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

function verdictOf(id: SeasoningId, reading: Report['reading']): string {
  const meter = METERS[id];
  if (!reading) return meter.waiting;
  const step = meter.steps[reading.at]!;
  return `${step.level}! ${step.says}`;
}

// ---------- Salty Sam: spelling ----------

export function saltReport({ doc, issues }: ReportInput): Report {
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
  if (repeats[0]) actions.push(`Fix “${repeats[0][1][0]!.word}” first. It turns up ${plural(repeats[0][1].length, 'time')}, so one fix does the lot.`);
  if (byName[0]) actions.push(`“${byName[0][0]}”? Pretty sure you mean ${byName[0][1][0]!.issue.suggestions[0] ?? 'one of your characters'}. Check their Pantry card.`);
  if (plain.length > 0) actions.push('A word I don’t know but you do, like a place or a made-up word? Right-click it and add it to the dictionary, and I’ll stop nagging.');
  if (slips.length === 0 && total > 0) actions.push('Not a grain out of place. Go and salt the next Item.');

  return {
    id: 'sam',
    title: METERS.sam.report,
    reading,
    verdict: verdictOf('sam', reading),
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

/** Pete's name for a slip: the word before the "!" in what he says about it. */
function troubleOf(i: FoundIssue): { kind: string; says: string } {
  const said = remark(i.issue, i.word);
  const m = /^([^!]{2,24})! (.*)$/s.exec(said);
  return m ? { kind: m[1]!, says: m[2]! } : { kind: 'Grammar', says: said };
}

export function pepperReport({ doc, issues }: ReportInput): Report {
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
  if (byKind[0]) actions.push(`Start with the ${byKind[0][0].toLowerCase()} slips. There ${byKind[0][1].length === 1 ? 'is one' : `are ${byKind[0][1].length}`}, more than anything else.`);
  if (worst && worst[1] >= 3 && paras[worst[0]]) actions.push(`The paragraph starting “${opening(paras[worst[0]]!.text)}” has ${worst[1]} slips. Give it a once-over.`);
  if (slips.length > 0) actions.push('Click any underline on the page for my fix. F7 takes you to the next one.');
  if (slips.length === 0 && total > 0) actions.push('Clean grammar. Nothing to grind. Off you go.');

  return {
    id: 'pete',
    title: METERS.pete.report,
    reading,
    verdict: verdictOf('pete', reading),
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

/** The reports there are, by seasoning. */
export const REPORTS: Partial<Record<SeasoningId, (input: ReportInput) => Report>> = { sam: saltReport, pete: pepperReport };

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
