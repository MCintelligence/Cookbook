import { Extension } from '@tiptap/core';
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state';
import { type EditorView } from '@tiptap/pm/view';
import { IS_MAC } from '../shortcuts';

/*
 * Page Up, Page Down, Home and End, done by the page itself rather than the
 * browser. Left to the browser they scroll with an animation that the next
 * press cuts short, the caret lands wherever the half-finished scroll left it,
 * and Page Up at the top can even scroll down to fetch a caret below the fold.
 * Here each press scrolls at once by a fixed amount, so presses add up exactly
 * as in a word processor.
 */

/** Where Page Up or Page Down puts the caret, worked out without the browser so it can be tested. */
export function pageTarget(o: {
  /** -1 for Page Up, 1 for Page Down. */
  dir: -1 | 1;
  /** The caret's height on screen before the press, already inside the window. */
  y: number;
  /** How far one press goes. */
  page: number;
  /** How far the window actually scrolled: less than a page at either end. */
  moved: number;
  /** The text's top and bottom on screen, after the scroll. */
  top: number;
  bottom: number;
}): 'start' | 'end' | number {
  // The caret goes a page further into the text; whatever the scroll couldn't
  // cover, the caret covers by moving on the screen instead.
  const y = o.y + o.dir * o.page - o.moved;
  if (y < o.top) return 'start';
  if (y > o.bottom) return 'end';
  return y;
}

/** The box that scrolls the page: the desk in the app. */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight) return at;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** The part of the scroller that's on screen. */
function windowOf(scroller: HTMLElement): { top: number; bottom: number } {
  if (scroller === document.scrollingElement || scroller === document.documentElement) return { top: 0, bottom: window.innerHeight };
  const r = scroller.getBoundingClientRect();
  return { top: Math.max(r.top, 0), bottom: Math.min(r.top + scroller.clientHeight, window.innerHeight) };
}

/** Where a string of Page presses started across the line, so the caret keeps to its column. */
let goal: { x: number; head: number } | null = null;

function pageKey(view: EditorView, dir: -1 | 1, extend: boolean): boolean {
  const { state } = view;
  const scroller = scrollerOf(view.dom);
  const shown = windowOf(scroller);
  if (shown.bottom - shown.top < 40) return false;
  const head = state.selection.head;
  const caret = view.coordsAtPos(head);
  const line = Math.max(caret.bottom - caret.top, 12);
  const x = goal && goal.head === head ? goal.x : caret.left;
  // A caret scrolled out of sight pages from the edge of the window, not from where it was left.
  const y = Math.min(Math.max((caret.top + caret.bottom) / 2, shown.top + line / 2), shown.bottom - line / 2);
  // A page is a window's height less a couple of lines, so the line just read stays in sight.
  const page = Math.max(shown.bottom - shown.top - 2 * line, line);
  const before = scroller.scrollTop;
  scroller.scrollTop = before + dir * page;
  const moved = scroller.scrollTop - before;
  const text = view.dom.getBoundingClientRect();
  const target = pageTarget({ dir, y, page, moved, top: text.top, bottom: text.bottom });
  let pos: number;
  if (target === 'start') pos = Selection.atStart(state.doc).from;
  else if (target === 'end') pos = Selection.atEnd(state.doc).to;
  else {
    const left = Math.min(Math.max(x, text.left + 1), text.right - 1);
    const top = Math.min(Math.max(target, shown.top + 1), shown.bottom - 1);
    const found = view.posAtCoords({ left, top });
    if (!found) return true;
    pos = found.pos;
  }
  const $pos = state.doc.resolve(pos);
  const sel = extend ? TextSelection.between(state.selection.$anchor, $pos) : Selection.near($pos, dir);
  // No scrollIntoView: the scroll is already done, and the caret is in sight.
  view.dispatch(state.tr.setSelection(sel));
  if (target === 'start') scroller.scrollTop = 0;
  if (target === 'end') scroller.scrollTop = scroller.scrollHeight;
  goal = { x, head: view.state.selection.head };
  return true;
}

/**
 * Ctrl+Home and Ctrl+End: the very start or end, scrolled all the way. The
 * browser's own Ctrl+End stops short of a table at the end of the scene.
 */
function endsKey(view: EditorView, dir: -1 | 1, extend: boolean): boolean {
  const { state } = view;
  const $to = state.doc.resolve(dir < 0 ? Selection.atStart(state.doc).from : Selection.atEnd(state.doc).to);
  view.dispatch(state.tr.setSelection(extend ? TextSelection.between(state.selection.$anchor, $to) : Selection.near($to, dir)));
  const scroller = scrollerOf(view.dom);
  scroller.scrollTop = dir < 0 ? 0 : scroller.scrollHeight;
  return true;
}

/** Home and End: the start or end of the line on screen, scrolled to at once. */
function lineKey(view: EditorView, dir: -1 | 1, extend: boolean): boolean {
  const dom = view.dom.ownerDocument.getSelection();
  if (!dom || !view.hasFocus() || typeof dom.modify !== 'function') return false;
  dom.modify(extend ? 'extend' : 'move', dir < 0 ? 'backward' : 'forward', 'lineboundary');
  if (!dom.focusNode || !dom.anchorNode || !view.dom.contains(dom.focusNode)) return true;
  const { doc } = view.state;
  const head = view.posAtDOM(dom.focusNode, dom.focusOffset);
  const anchor = extend ? view.state.selection.anchor : head;
  view.dispatch(view.state.tr.setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head))).scrollIntoView());
  return true;
}

export const PageKeys = Extension.create({
  name: 'pageKeys',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view, e) {
            if (e.altKey || e.isComposing) return false;
            const mod = IS_MAC ? e.metaKey : e.ctrlKey;
            const home = e.key === 'Home' || e.key === 'End';
            if (mod && home && !(IS_MAC ? e.ctrlKey : e.metaKey)) {
              e.preventDefault();
              return endsKey(view, e.key === 'Home' ? -1 : 1, e.shiftKey);
            }
            if (e.metaKey || e.ctrlKey) return false;
            let done = false;
            if (e.key === 'PageDown' || e.key === 'PageUp') done = pageKey(view, e.key === 'PageUp' ? -1 : 1, e.shiftKey);
            // A Mac's Home and End scroll the page without moving the caret; that's left as it is.
            else if (!IS_MAC && home) done = lineKey(view, e.key === 'Home' ? -1 : 1, e.shiftKey);
            if (done) e.preventDefault();
            return done;
          },
        },
      }),
    ];
  },
});
