import type { EditorView } from '@tiptap/pm/view';

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/**
 * The document position under a point on screen, such as where a click landed.
 *
 * ProseMirror's own lookup (posAtCoords) measures the text's boxes, and on a zoomed page
 * (the page zoom is CSS zoom) the Mac's engine gives those boxes in a different scale
 * from the click, so a click on a word can come back as the end of its paragraph. The
 * engine's own hit test, which places the caret on a click, is asked first instead.
 */
export function posAtPoint(view: EditorView, x: number, y: number): number | null {
  const doc = view.dom.ownerDocument as CaretDoc;
  let node: Node | null = null;
  let offset = 0;
  try {
    if (doc.caretPositionFromPoint) {
      const at = doc.caretPositionFromPoint(x, y);
      if (at) ({ offsetNode: node, offset } = at);
    } else if (doc.caretRangeFromPoint) {
      const at = doc.caretRangeFromPoint(x, y);
      if (at) ({ startContainer: node, startOffset: offset } = at);
    }
    if (node && view.dom.contains(node)) {
      const pos = view.posAtDOM(node, offset);
      if (pos >= 0 && pos <= view.state.doc.content.size) return pos;
    }
  } catch {
    // Fall back to ProseMirror's lookup below.
  }
  return view.posAtCoords({ left: x, top: y })?.pos ?? null;
}
