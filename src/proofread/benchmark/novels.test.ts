import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCounts } from '../context';
import { coreOnly } from '../parse';
import './review';

/**
 * False alarms of Pete's grammar core on published prose. The novels aren't in the repo: point
 * NOVELS_DIR at a folder of public-domain .txt files (Project Gutenberg) and run
 *
 *   NOVELS_DIR=path NOVELS_OUT=report.txt npx vitest run src/proofread/benchmark/novels.test.ts
 *
 * Every underline is listed, to be read by hand: most should be real slips by today's rules.
 */
const dir = process.env.NOVELS_DIR ?? '';

describe.skipIf(!dir || !existsSync(dir))('Grammar core on novels', () => {
  it('lists every underline', () => {
    const counts = [parseCounts(readFileSync('public/dictionaries/word-pairs.txt', 'utf8'))];
    const lines: string[] = [];
    const byRule = new Map<string, number>();
    let words = 0;
    const started = Date.now();
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
      const paragraphs = readFileSync(`${dir}/${f}`, 'utf8').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
      for (const p of paragraphs) {
        words += p.split(/\s+/).length;
        for (const i of coreOnly(p, counts)) {
          byRule.set(i.rule, (byRule.get(i.rule) ?? 0) + 1);
          lines.push(`${f}\t${i.rule}\t“${p.slice(i.from, i.to)}” → ${i.suggestions[0] ?? ''}\t…${p.slice(Math.max(0, i.from - 60), i.to + 40)}…`);
        }
      }
    }
    const total = lines.length;
    const report = [`${words} words, ${total} underlines (one per ${Math.round(words / Math.max(1, total))} words), ${((Date.now() - started) / 1000).toFixed(1)} s`, ...[...byRule].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}\t${n}`), '', ...lines.sort()].join('\n');
    if (process.env.NOVELS_OUT) writeFileSync(process.env.NOVELS_OUT, report);
    expect(words).toBeGreaterThan(0);
  }, 1_800_000);
});
