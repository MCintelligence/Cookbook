import { readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Issue } from './check';
import { marks, review, setUp } from './benchmark/review';

/**
 * Seasonings against a labelled test set (src/proofread/benchmark), with every check at its
 * default setting. A mistake counts as found when Sam or Pete underlines any of its marked
 * words; it counts as fixed when the first suggestion turns the sentence into the right one.
 * Style notes from Sally aren't counted either way. BENCH_OUT=path writes the full report.
 */

interface Case {
  category: string;
  text: string;
  from: number;
  to: number;
  right: string;
}

function cases(file: string): Case[] {
  return readFileSync(`src/proofread/benchmark/${file}`, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [category, marked] = line.split('\t') as [string, string];
      const m = /\[\[(.*?)\|(.*?)\]\]/.exec(marked)!;
      const text = marked.replace(m[0], m[1]!);
      return {
        category,
        text,
        from: m.index,
        to: m.index + m[1]!.length,
        right: marked.replace(m[0], m[2]!),
      };
    });
}

/** An empty span (a missing word) counts as touched by an underline right beside it. */
const touches = (i: Issue, c: Case) => (c.from === c.to ? i.from <= c.to && i.to >= c.from : i.from < c.to && i.to > c.from);
const plain = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

interface Score {
  category: string;
  total: number;
  found: number;
  fixed: number;
}

async function score(file: string, lines: string[]): Promise<Score[]> {
  const by = new Map<string, Score>();
  for (const c of cases(file)) {
    const s = by.get(c.category) ?? {
      category: c.category,
      total: 0,
      found: 0,
      fixed: 0,
    };
    by.set(c.category, s);
    s.total++;
    const hits = marks(await review(c.text)).filter((i) => touches(i, c));
    if (hits.length > 0) s.found++;
    const fixed = hits.some((i) => i.suggestions[0] !== undefined && plain(c.text.slice(0, i.from) + i.suggestions[0] + c.text.slice(i.to)) === plain(c.right));
    if (fixed) s.fixed++;
    lines.push(`${hits.length ? (fixed ? 'FIXED' : 'FOUND') : 'MISSED'}\t${c.category}\t${c.text}\t${hits.map((h) => `${h.rule}:${h.suggestions[0] ?? ''}`).join(', ')}`);
  }
  return [...by.values()];
}

const total = (ss: Score[]) =>
  ss.reduce(
    (a, s) => ({
      category: 'all',
      total: a.total + s.total,
      found: a.found + s.found,
      fixed: a.fixed + s.fixed,
    }),
    { category: 'all', total: 0, found: 0, fixed: 0 },
  );

describe('Seasonings benchmark', () => {
  beforeAll(async () => {
    await setUp();
  }, 30_000);

  it('finds most mistakes and raises no false alarms on correct sentences', async () => {
    const lines: string[] = [];
    const learner = await score('learner.txt', lines);
    const writer = await score('writer.txt', lines);
    const heldout = await score('heldout.txt', lines);
    const clean = readFileSync('src/proofread/benchmark/clean.txt', 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'));
    let alarms = 0;
    for (const text of clean) {
      const found = marks(await review(text));
      if (found.length > 0) {
        alarms++;
        lines.push(`FALSE ALARM\t\t${text}\t${found.map((h) => `${h.rule} “${text.slice(h.from, h.to)}”`).join(', ')}`);
      }
    }
    const l = total(learner);
    const w = total(writer);
    const h = total(heldout);
    if (process.env.BENCH_OUT) {
      const row = (s: Score) => `${s.category}\t${s.found}/${s.total}\t${s.fixed}/${s.total}`;
      writeFileSync(
        process.env.BENCH_OUT,
        [
          'LEARNER',
          ...learner.map(row),
          row(l),
          '',
          'WRITER',
          ...writer.map(row),
          row(w),
          '',
          'HELD OUT',
          ...heldout.map(row),
          row(h),
          '',
          `CLEAN false alarms ${alarms}/${clean.length}`,
          '',
          ...lines,
        ].join('\n'),
      );
    }
    expect(l.found / l.total).toBeGreaterThanOrEqual(BAR.learner);
    expect(w.found / w.total).toBeGreaterThanOrEqual(BAR.writer);
    expect(h.found / h.total).toBeGreaterThanOrEqual(BAR.heldout);
    expect(alarms).toBeLessThanOrEqual(BAR.alarms);
  }, 120_000);
});

/** Where Seasonings stands now, so a change that makes it worse fails. */
const BAR = { learner: 0.88, writer: 0.95, heldout: 0.85, alarms: 0 };
