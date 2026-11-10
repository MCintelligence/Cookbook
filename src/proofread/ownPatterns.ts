import { type Issue } from './check';
import { patternSource } from './styleLists';

/**
 * The writer's own list for Spicy Sally, one entry a line, kept with the recipe:
 *
 *   honestly                  marks “honestly”
 *   {grinned|smirked} wryly   {a|b} slots mark each choice
 *   a myriad of => many       => gives the fix
 *   -suddenly                 a leading - means never mark it, whatever rule would
 *   # a note                  ignored
 */
export interface OwnPatterns {
  /** Each phrase to mark, and its fix if it has one. */
  marks: { test: RegExp; fix?: string }[];
  /** Phrases Sally leaves alone, whichever rule would mark them. */
  spare: RegExp | null;
}

export const NO_PATTERNS: OwnPatterns = { marks: [], spare: null };

const whole = (source: string) => `(?<![\\p{L}'’])(?:${source})(?![\\p{L}'’])`;

/** A line's pattern, or null if its braces don't pair up. */
function sourceOf(pattern: string): string | null {
  if (!/[\p{L}\p{N}]/u.test(pattern)) return null;
  let depth = 0;
  for (const c of pattern) {
    depth += c === '{' ? 1 : c === '}' ? -1 : 0;
    if (depth < 0 || depth > 1) return null;
  }
  return depth === 0 ? patternSource(pattern) : null;
}

export function compilePatterns(lines: readonly string[]): OwnPatterns {
  const marks: OwnPatterns['marks'] = [];
  const spare: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('-')) {
      const source = sourceOf(line.slice(1).trim());
      if (source) spare.push(whole(source));
      continue;
    }
    const [pattern = '', fix] = line.split(/\s*(?:=>|→)\s*/);
    const source = sourceOf(pattern.trim());
    if (source) marks.push({ test: new RegExp(whole(source), 'giu'), ...(fix !== undefined && { fix: fix.trim() }) });
  }
  return { marks, spare: spare.length > 0 ? new RegExp(spare.join('|'), 'giu') : null };
}

/** What the writer's own list marks in a paragraph. */
export function ownPatternIssues(text: string, own: OwnPatterns): Issue[] {
  const out: Issue[] = [];
  for (const { test, fix } of own.marks) {
    for (const m of text.matchAll(test)) {
      if (!m[0]) continue;
      out.push({
        from: m.index,
        to: m.index + m[0].length,
        kind: 'style',
        rule: 'own-pattern',
        message: fix ? `Your list says “${fix}” rather than “${m[0]}”.` : `“${m[0]}” is on your list.`,
        suggestions: fix !== undefined ? [fix] : [],
        why: 'You put this on your own list in Recipe Settings › Seasonings.',
      });
    }
  }
  return out;
}

/** Sally's notes with the writer's own added; where they overlap, the writer's list wins. */
export function withOwn(style: Issue[], own: Issue[]): Issue[] {
  if (own.length === 0) return style;
  const clear = style.filter((i) => i.rule === 'sticky-sentence' || !own.some((o) => i.from < o.to && i.to > o.from));
  return [...clear, ...own].sort((a, b) => a.from - b.from || b.to - a.to);
}

/** Drops Sally's notes on anything the writer said to leave alone. Spelling and grammar are untouched. */
export function spareExceptions(text: string, issues: Issue[], own: OwnPatterns): Issue[] {
  if (!own.spare) return issues;
  const kept: [number, number][] = [...text.matchAll(own.spare)].filter((m) => m[0]).map((m) => [m.index, m.index + m[0].length]);
  if (kept.length === 0) return issues;
  return issues.filter((i) => i.kind !== 'style' || i.rule === 'sticky-sentence' || !kept.some(([a, b]) => i.from < b && i.to > a));
}
