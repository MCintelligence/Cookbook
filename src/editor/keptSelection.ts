import { Extension } from '@tiptap/core';
import { AllSelection, Plugin, PluginKey, type Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { IS_MAC } from '../shortcuts';

/** Where focus can go while the page's selection should still show: menus, the menu bar and the format toolbar. */
const KEEPS = '[role=menu], .menu, .menubar, .toolbar';

const key = new PluginKey<boolean>('keptSelection');
/** Marks the selection this plugin puts back, which the hold lets through. */
const HOLD = 'keptSelectionHold';

const keeps = (el: EventTarget | null) => el instanceof Element && !!el.closest(KEEPS);

/** Selected text to keep: a stretch of text, or everything after Select all (⌘A makes a selection of its own kind). */
const spans = (sel: Selection) => (sel instanceof TextSelection || sel instanceof AllSelection) && !sel.empty;

/** A press that opens the right-click menu: the right button (a two-finger tap), or Control with the button on a Mac. */
export const isMenuPress = (e: MouseEvent, mac = IS_MAC) => e.button === 2 || (mac && e.button === 0 && e.ctrlKey);

/** How long after the button comes up the selection is still held, for engines that move it late. */
const SETTLE = 400;

/** The text selected on the page, read from the page itself when the editor has not caught up with it. */
function onPage(view: EditorView): Selection {
  const sel = view.state.selection;
  if (spans(sel)) return sel;
  const dom = view.dom.ownerDocument.getSelection();
  if (!dom || dom.isCollapsed || !dom.anchorNode || !dom.focusNode || !view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return sel;
  try {
    const anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset);
    const head = view.posAtDOM(dom.focusNode, dom.focusOffset);
    return TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(head));
  } catch {
    return sel;
  }
}

/** The selection to paint while it is kept, or null. */
export function keptRange(state: EditorState): { from: number; to: number } | null {
  if (!key.getState(state)) return null;
  const sel = state.selection;
  return spans(sel) ? { from: sel.from, to: sel.to } : null;
}

/**
 * Keeps the selected text highlighted while a menu or the toolbar has the
 * keyboard. A right-click menu takes focus from the page, and WebKit (the Mac
 * and Linux app) then stops drawing the selection, so the text looks
 * deselected even though it is still selected. This draws it instead until
 * the keyboard comes back to the page or goes somewhere else.
 */
export const KeptSelection = Extension.create({
  name: 'keptSelection',
  addProseMirrorPlugins() {
    // The selection a right-click landed on, held until the menu is up: the Mac's engine moves the
    // caret on a right-click that follows other clicks closely, and the menu would find nothing selected.
    let held: { sel: Selection; until: number } | null = null;
    const holding = (state: EditorState) => !!held && held.sel.$anchor.doc === state.doc && Date.now() < held.until;
    const set = (view: EditorView, on: boolean) => {
      if (key.getState(view.state) !== on && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, on).setMeta('addToHistory', false));
    };
    return [
      new Plugin<boolean>({
        key,
        state: {
          init: () => false,
          apply: (tr, on) => (tr.getMeta(key) as boolean | undefined) ?? on,
        },
        // While a right-click is opening its menu, nothing moves the selection it landed on.
        filterTransaction: (tr, state) => !(holding(state) && !tr.docChanged && tr.selectionSet && !tr.getMeta(HOLD) && !tr.selection.eq(held!.sel)),
        props: {
          decorations(state) {
            const range = keptRange(state);
            return range
              ? DecorationSet.create(state.doc, [
                  Decoration.inline(range.from, range.to, {
                    class: 'cb-kept-selection',
                  }),
                ])
              : null;
          },
          attributes: (state): Record<string, string> => (key.getState(state) ? { class: 'cb-keeps-selection' } : {}),
          handleDOMEvents: {
            mousedown(view, e) {
              held = null;
              if (!isMenuPress(e)) return false;
              const sel = onPage(view);
              if (!spans(sel)) return false;
              const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
              if (!at || at.pos < sel.from || at.pos > sel.to) return false;
              // The page showed a selection the editor had not taken in yet: take it in now.
              if (!sel.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(sel).setMeta(HOLD, true).setMeta('addToHistory', false));
              held = { sel: view.state.selection, until: Infinity };
              const release = (up: MouseEvent) => {
                if (up.button !== e.button) return;
                window.removeEventListener('mouseup', release, true);
                if (held) held.until = Date.now() + SETTLE;
              };
              window.addEventListener('mouseup', release, true);
              return false;
            },
            contextmenu(view) {
              if (held && held.until === Infinity) held.until = Date.now() + 1500;
              // If the selection went anyway, it comes back before the menu is built.
              if (holding(view.state) && !view.state.selection.eq(held!.sel)) {
                view.dispatch(view.state.tr.setSelection(held!.sel).setMeta(HOLD, true).setMeta('addToHistory', false));
              }
              return false;
            },
            focus(view) {
              set(view, false);
              return false;
            },
            blur(view, e) {
              // Switching to another app hides the selection as usual.
              if (!document.hasFocus()) return false;
              if (keeps(e.relatedTarget) || keeps(document.activeElement)) set(view, true);
              // Some engines say where the focus went only once it has arrived.
              else
                requestAnimationFrame(() => {
                  if (!view.isDestroyed && !view.hasFocus() && keeps(document.activeElement)) set(view, true);
                });
              return false;
            },
          },
        },
        view(view) {
          // Anywhere else the keyboard or a press goes, the page lets go of the highlight.
          const away = (e: Event) => {
            if (key.getState(view.state) && !keeps(e.target) && !view.dom.contains(e.target as Node)) set(view, false);
          };
          document.addEventListener('focusin', away);
          document.addEventListener('pointerdown', away, true);
          return {
            destroy() {
              document.removeEventListener('focusin', away);
              document.removeEventListener('pointerdown', away, true);
            },
          };
        },
      }),
    ];
  },
});
