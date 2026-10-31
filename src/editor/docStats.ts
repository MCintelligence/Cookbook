import { type Node as PMNode } from '@tiptap/pm/model';
import { countWords } from '../storage/index';
import { sentences } from '../proofread/style';

/**
 * Counts over the open Item that only redo the blocks that changed.
 *
 * ProseMirror never changes a node: typing makes a new paragraph and a new
 * document, and every other paragraph is the same object as before. So each
 * count is kept per block, and per document, in a WeakMap: a cursor move (same
 * document) costs nothing and a keystroke recounts one paragraph, however long
 * the Item is.
 */

const wordsByBlock = new WeakMap<PMNode, number>();
const wordsByDoc = new WeakMap<PMNode, number>();

/** Words in a document, the same as counting `doc.textBetween(0, size, ' ')`. */
export function docWords(doc: PMNode): number {
  let total = wordsByDoc.get(doc);
  if (total !== undefined) return total;
  total = 0;
  doc.forEach((block) => {
    let n = wordsByBlock.get(block);
    if (n === undefined) {
      n = countWords(block.textBetween(0, block.content.size, ' '));
      wordsByBlock.set(block, n);
    }
    total! += n;
  });
  wordsByDoc.set(doc, total);
  return total;
}

const notesByBlock = new WeakMap<PMNode, string[]>();
const notesByDoc = new WeakMap<PMNode, string[]>();
const NONE: string[] = [];

/** The text of every footnote in a document, in order. */
export function footnoteTexts(doc: PMNode): string[] {
  const known = notesByDoc.get(doc);
  if (known) return known;
  const all: string[] = [];
  doc.forEach((block) => {
    let own = notesByBlock.get(block);
    if (!own) {
      own = [];
      block.descendants((node) => {
        if (node.type.name === 'footnote') own!.push(node.attrs.text as string);
        return node.isBlock;
      });
      notesByBlock.set(block, own.length > 0 ? own : NONE);
    }
    all.push(...own);
  });
  notesByDoc.set(doc, all);
  return all;
}

interface Reading {
  letters: number;
  words: number;
  sentences: number;
}
const readingByBlock = new WeakMap<PMNode, Reading>();
const readingByDoc = new WeakMap<PMNode, Reading>();

/** Letters, words and sentences in a document's text blocks, for its grade level (see textGrade). */
export function docReading(doc: PMNode): Reading {
  let total = readingByDoc.get(doc);
  if (total) return total;
  const sum: Reading = { letters: 0, words: 0, sentences: 0 };
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    let own = readingByBlock.get(node);
    if (!own) {
      own = { letters: 0, words: 0, sentences: 0 };
      for (const s of sentences(node.textContent)) {
        own.letters += s.letters;
        own.words += s.words;
        own.sentences++;
      }
      readingByBlock.set(node, own);
    }
    sum.letters += own.letters;
    sum.words += own.words;
    sum.sentences += own.sentences;
    return false;
  });
  readingByDoc.set(doc, sum);
  return sum;
}
