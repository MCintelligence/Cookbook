import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Issue } from '../check';
import { marks, review, setUp } from './review';

/**
 * Seasonings on JFLEG (Napoles, Sakaguchi & Tetreault 2017): real sentences by English learners,
 * each corrected by four annotators who had nothing to do with Cookbook. The corpus is
 * CC BY-NC-SA 4.0, so it isn't kept in the repo: fetch dev/ and test/ from
 * https://github.com/keisks/jfleg and run
 *
 *   JFLEG_DIR=path/to/jfleg JFLEG_SPLIT=dev JFLEG_OUT=report.txt npx vitest run src/proofread/benchmark/jfleg.test.ts
 *
 * Each place a corrector changed the learner's words is a mistake. A mistake is found when an
 * underline touches it; an underline that touches none is a false alarm. Of the four corrections
 * the one that suits Seasonings best is used, as the M2 and ERRANT scorers do. Corrected
 * sentences are checked too: an underline there is a false alarm on good English.
 * Tune on dev only. test is for the final score.
 */

const dir = process.env.JFLEG_DIR ?? '';
const split = process.env.JFLEG_SPLIT ?? 'dev';

interface Tok {
  word: string;
  from: number;
  to: number;
}

const NO_SPACE_BEFORE = /^(?:[.,!?;:%)\]}]|'s|'re|'ve|'m|'ll|'d|n't|'|\.\.\.)$/i;
const NO_SPACE_AFTER = /^[([{$]$/;

/** JFLEG is tokenised ("do n't", "home ."); put it back the way a writer types it, keeping where each token went. */
export function detokenise(line: string): { text: string; toks: Tok[] } {
  const words = line.trim().split(/\s+/).filter(Boolean);
  let text = '';
  const toks: Tok[] = [];
  let quoteOpen = false;
  words.forEach((w, i) => {
    const prev = words[i - 1];
    let space = i > 0;
    if (NO_SPACE_BEFORE.test(w) || (prev && NO_SPACE_AFTER.test(prev))) space = false;
    if (w === '"') {
      if (quoteOpen) space = false;
      quoteOpen = !quoteOpen;
    } else if (prev === '"' && quoteOpen) space = false;
    if (w === "n't" && /^ca$/i.test(prev ?? '')) space = false;
    if (space) text += ' ';
    toks.push({ word: w, from: text.length, to: text.length + w.length });
    text += w;
  });
  return { text, toks };
}

interface Edit {
  from: number;
  to: number;
  src: string[];
  ref: string[];
  category: string;
}

/** The token spans a corrector changed, by a longest-common-subsequence alignment. */
function edits(src: Tok[], ref: string[], lower = (w: string) => w.toLowerCase()): { from: number; to: number; src: string[]; ref: string[] }[] {
  const a = src.map((t) => t.word);
  const n = a.length;
  const m = ref.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i]![j] = a[i] === ref[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: { from: number; to: number; src: string[]; ref: string[] }[] = [];
  let i = 0;
  let j = 0;
  let open: { i: number; j: number } | null = null;
  const close = (ei: number, ej: number) => {
    if (!open) return;
    const s = a.slice(open.i, ei);
    const r = ref.slice(open.j, ej);
    // A capital-only change that both sides spell the same way is still an edit; skip true no-ops.
    if (s.join(' ') !== r.join(' ')) {
      const from = open.i < n ? src[open.i]!.from : (src.at(-1)?.to ?? 0);
      const to = ei > open.i ? src[ei - 1]!.to : from;
      out.push({ from, to, src: s, ref: r });
    }
    open = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === ref[j]) {
      close(i, j);
      i++;
      j++;
    } else {
      open ??= { i, j };
      if (j >= m || (i < n && L[i + 1]![j]! >= L[i]![j + 1]!)) i++;
      else j++;
    }
  }
  close(i, j);
  void lower;
  return out;
}

const PUNCT = /^[^\p{L}\p{N}]+$/u;
const DETS = new Set('a an the this that these those some any much many each every no'.split(' '));
const PREPS = new Set('in on at to for of with by from about into onto over under between among through during before after since until without within against toward towards upon across behind beyond near off out up down around like as than'.split(' '));
const PRONOUNS = new Set('i me my mine you your yours he him his she her hers it its we us our ours they them their theirs myself yourself himself herself itself ourselves themselves who whom whose which that'.split(' '));

/** A rough sort of what a corrector changed, by the words on each side. */
function categorise(src: string[], ref: string[], isWord: (w: string) => boolean): string {
  const s = src.map((w) => w.toLowerCase());
  const r = ref.map((w) => w.toLowerCase());
  const all = [...s, ...r];
  if (all.length > 0 && all.every((w) => PUNCT.test(w))) return 'punctuation';
  if (s.join(' ') === r.join(' ')) return 'capitals';
  if (s.length === 1 && r.length === 1) {
    const [x, y] = [s[0]!, r[0]!];
    if (/^\p{L}+$/u.test(x) && !isWord(x) && !isWord(src[0]!)) return 'spelling';
    if (DETS.has(x) || DETS.has(y)) return 'determiner';
    if (PREPS.has(x) && PREPS.has(y)) return 'preposition';
    if (PRONOUNS.has(x) && PRONOUNS.has(y)) return 'pronoun';
    if (y === `${x}s` || y === `${x}es` || x === `${y}s` || x === `${y}es` || (x.endsWith('y') && y === `${x.slice(0, -1)}ies`) || (y.endsWith('y') && x === `${y.slice(0, -1)}ies`)) return 'noun-number';
    if (x.slice(0, 3) === y.slice(0, 3) && x.length > 2) return 'word-form-or-verb';
    return 'word-choice';
  }
  if ((s.length === 0 || r.length === 0) && all.length === 1) {
    const w = all[0]!;
    if (DETS.has(w)) return s.length ? 'extra-determiner' : 'missing-determiner';
    if (PREPS.has(w)) return s.length ? 'extra-preposition' : 'missing-preposition';
    if (PUNCT.test(w)) return 'punctuation';
    if (/^(?:is|are|was|were|be|been|am|have|has|had|do|does|did|will|would|to)$/.test(w)) return s.length ? 'extra-verb-word' : 'missing-verb-word';
    return s.length ? 'extra-word' : 'missing-word';
  }
  return 'rewrite';
}

interface Tally {
  total: number;
  found: number;
}

const touches = (i: Issue, e: { from: number; to: number }) => (e.from === e.to ? i.from <= e.to && i.to >= e.from : i.from < e.to && i.to > e.from);

describe.skipIf(!dir || !existsSync(`${dir}/${split}/${split}.src`))('Seasonings on JFLEG', () => {
  beforeAll(async () => {
    await setUp();
  }, 30_000);

  it('scores found mistakes and false alarms', async () => {
    const isWord = (await import('./review')).isWord;
    const src = readFileSync(`${dir}/${split}/${split}.src`, 'utf8').split('\n');
    const refs = [0, 1, 2, 3].map((k) => readFileSync(`${dir}/${split}/${split}.ref${k}`, 'utf8').split('\n'));
    const byCat = new Map<string, Tally>();
    const byRule = new Map<string, { right: number; wrong: number }>();
    let underlines = 0;
    let right = 0;
    let total = 0;
    let found = 0;
    let cleanAlarms = 0;
    let cleanSentences = 0;
    const cleanRules = new Map<string, number>();
    const lines: string[] = [];
    const count = src.filter((l) => l.trim()).length;
    for (let k = 0; k < count; k++) {
      const { text, toks } = detokenise(src[k]!);
      const issues = marks(await review(text));
      // The correction that suits Seasonings best: most mistakes found, then fewest false alarms.
      let best: { es: Edit[]; hit: number; fp: number } | null = null;
      for (const r of refs) {
        const es = edits(toks, r[k]!.trim().split(/\s+/).filter(Boolean)).map((e) => ({ ...e, category: categorise(e.src, e.ref, isWord) }));
        const hit = es.filter((e) => issues.some((i) => touches(i, e))).length;
        const fp = issues.filter((i) => !es.some((e) => touches(i, e))).length;
        if (!best || hit - fp > best.hit - best.fp || (hit - fp === best.hit - best.fp && es.length < best.es.length)) best = { es, hit, fp };
      }
      const b = best!;
      for (const e of b.es) {
        const t = byCat.get(e.category) ?? { total: 0, found: 0 };
        byCat.set(e.category, t);
        t.total++;
        total++;
        const hit = issues.some((i) => touches(i, e));
        if (hit) {
          t.found++;
          found++;
        }
        lines.push(`${hit ? 'FOUND' : 'MISSED'}\t${e.category}\t${e.src.join(' ')} → ${e.ref.join(' ')}\t${text}`);
      }
      for (const i of issues) {
        underlines++;
        const ok = b.es.some((e) => touches(i, e));
        if (ok) right++;
        const r = byRule.get(i.rule) ?? { right: 0, wrong: 0 };
        byRule.set(i.rule, r);
        if (ok) r.right++;
        else {
          r.wrong++;
          lines.push(`FALSE ALARM\t${i.rule}\t“${text.slice(i.from, i.to)}” → ${i.suggestions[0] ?? ''}\t${text}`);
        }
      }
      // The first correction, read as finished English.
      const clean = detokenise(refs[0]![k]!).text;
      if (clean) {
        cleanSentences++;
        const ci = marks(await review(clean));
        if (ci.length) {
          cleanAlarms++;
          for (const i of ci) cleanRules.set(i.rule, (cleanRules.get(i.rule) ?? 0) + 1);
          lines.push(`CLEAN ALARM\t${ci.map((i) => `${i.rule} “${clean.slice(i.from, i.to)}”`).join(', ')}\t${clean}`);
        }
      }
    }
    const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
    const report = [
      `JFLEG ${split}: ${count} learner sentences`,
      `Mistakes found: ${found}/${total} (${pct(found, total)})`,
      `Underlines on a mistake: ${right}/${underlines} (${pct(right, underlines)})`,
      `Corrected sentences with any underline: ${cleanAlarms}/${cleanSentences} (${pct(cleanAlarms, cleanSentences)})`,
      '',
      'BY KIND OF MISTAKE',
      ...[...byCat].sort((x, y) => y[1].total - x[1].total).map(([c, t]) => `${c}\t${t.found}/${t.total}\t${pct(t.found, t.total)}`),
      '',
      'BY RULE (on a mistake / not)',
      ...[...byRule].sort((x, y) => y[1].right + y[1].wrong - x[1].right - x[1].wrong).map(([r, t]) => `${r}\t${t.right}\t${t.wrong}`),
      '',
      'RULES ON CORRECTED SENTENCES',
      ...[...cleanRules].sort((x, y) => y[1] - x[1]).map(([r, n]) => `${r}\t${n}`),
      '',
      ...lines,
    ].join('\n');
    if (process.env.JFLEG_OUT) writeFileSync(process.env.JFLEG_OUT, report);
    expect(total).toBeGreaterThan(0);
  }, 600_000);
});
