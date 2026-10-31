import { type RefObject, useEffect, useRef, useState } from 'react';
import { type StorageAdapter, baseName } from '../storage/adapter';
import { BOOKSHELF, type TreeNode, childrenOf, readDocument, walkFiles } from '../storage/book';
import { type CardSummary, countWords } from '../storage/index';
import { type OpenIndex } from '../storage/useBookIndex';
import { dialogueRanges } from '../editor/dialogue';
import { plainText } from '../editor/markdown';
import { type Tracked } from './Seasonings';

/** How long Daniel waits after a save before counting again. */
const COUNT_DELAY_MS = 600;

interface Counted {
  text: string;
  all: number;
  spoken: number;
}

/** Words in a text, and how many of them are inside quotes. */
export function spokenWords(text: string): { all: number; spoken: number } {
  let all = 0;
  let spoken = 0;
  for (const line of text.split('\n')) {
    all += countWords(line);
    for (const [a, b] of dialogueRanges(line)) spoken += countWords(line.slice(a, b));
  }
  return { all, spoken };
}

const same = (a: Tracked[], b: Tracked[]) => a.length === b.length && a.every((t, i) => t.path === b[i]!.path && t.title === b[i]!.title && t.share === b[i]!.share);

/**
 * Drunk Daniel's share of spoken words in each Item or Group he tracks. Each file's text comes
 * from the search index, which every save brings up to date, and is only counted again when it
 * changed; a file the index doesn't have yet is read from disk. The list only changes, and the
 * app only re-renders, when a share does.
 */
export function useTracked({ fs, on, paths: key, tree, cards, index, onText }: {
  fs: StorageAdapter | null;
  /** Daniel is one of the Recipe's seasonings. */
  on: boolean;
  /** What he tracks, one path a line. */
  paths: string;
  tree: TreeNode[];
  cards: Map<string, CardSummary>;
  index: RefObject<OpenIndex | null>;
  onText: (listener: () => void) => () => void;
}): Tracked[] {
  const [tracked, setTracked] = useState<Tracked[]>([]);
  const counts = useRef(new Map<string, Counted>());

  useEffect(() => {
    const paths = key ? key.split('\n') : [];
    if (!fs || !on || paths.length === 0) {
      setTracked([]);
      return;
    }
    let live = true;
    let timer: number | undefined;
    const titled = paths.map((p) => ({ path: p, title: cards.get(p)?.title ?? baseName(p).replace(/\.md$/, '') }));
    setTracked((before) => {
      const next = titled.map((t) => ({ ...t, share: before.find((b) => b.path === t.path)?.share ?? null }));
      return same(before, next) ? before : next;
    });
    const count = async () => {
      const out: Tracked[] = [];
      for (const t of titled) {
        const files = t.path.endsWith('.md') ? [t.path] : [...walkFiles(childrenOf(tree, BOOKSHELF, t.path))].map((f) => f.path);
        let all = 0;
        let spoken = 0;
        for (const f of files) {
          const text = index.current?.index.textOf(f) ?? plainText(await readDocument(fs, f).then((d) => d.body, () => ''));
          let known = counts.current.get(f);
          if (!known || known.text !== text) {
            known = { text, ...spokenWords(text) };
            counts.current.set(f, known);
          }
          all += known.all;
          spoken += known.spoken;
        }
        out.push({ ...t, share: all > 0 ? Math.round((spoken / all) * 100) : 0 });
      }
      if (live) setTracked((before) => (same(before, out) ? before : out));
    };
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void count(), COUNT_DELAY_MS);
    };
    later();
    const stop = onText(later);
    return () => {
      live = false;
      window.clearTimeout(timer);
      stop();
    };
  }, [fs, on, key, tree, cards, index, onText]);

  // A different Recipe has different files.
  useEffect(() => counts.current.clear(), [fs]);

  return tracked;
}
