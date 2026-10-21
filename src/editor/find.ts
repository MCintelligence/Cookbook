export interface FindOptions {
  matchCase: boolean;
  wholeWord: boolean;
}

/** Character offsets of every match of `query` in `text`. */
export function findInText(text: string, query: string, { matchCase, wholeWord }: FindOptions): [number, number][] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_'’])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  const re = new RegExp(pattern, matchCase ? 'gu' : 'giu');
  const out: [number, number][] = [];
  for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  return out;
}
