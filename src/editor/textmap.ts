import { type Node as PMNode } from '@tiptap/pm/model';

/** A text block's text, with the document position of every character. */
export interface TextMap {
  text: string;
  positions: number[];
}

/** Stands in for an inline node such as a footnote marker, so offsets stay one per position. */
const OBJECT = '￼';

/**
 * Text suggested for deletion (track changes) is left out, so the proofreader, Search and
 * linked names read the page as it would be with the change accepted; every other
 * character keeps its own position, so ranges still map back.
 */
export function textMap(block: PMNode, pos: number): TextMap {
  let text = '';
  const positions: number[] = [];
  block.forEach((child, offset) => {
    if (child.isText && child.marks.some((m) => m.type.name === 'deletion')) return;
    const start = pos + 1 + offset;
    const piece = child.isText ? child.text! : OBJECT;
    for (let i = 0; i < piece.length; i++) positions.push(start + i);
    text += piece;
  });
  return { text, positions };
}

/** Maps a [from, to) character range back to document positions. */
export function toRange(map: TextMap, from: number, to: number): { from: number; to: number } {
  return { from: map.positions[from]!, to: map.positions[to - 1]! + 1 };
}
