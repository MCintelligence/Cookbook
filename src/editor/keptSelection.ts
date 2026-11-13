import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { type Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Where focus can go while the page's selection should still show: menus, the menu bar and the format toolbar. */
const KEEPS = '[role=menu], .menu, .menubar, .toolbar';

const key = new PluginKey<boolean>('keptSelection');

const keeps = (el: EventTarget | null) => el instanceof Element && !!el.closest(KEEPS);

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A press that opens the right-click menu: the right button, or Control with the button on a Mac. */
export const isMenuPress = (e: MouseEvent, mac = IS_MAC) => e.button === 2 || (mac && e.button === 0 && e.ctrlKey);

/** The selection to paint while it is kept, or null. */
export function keptRange(state: EditorState): { from: number; to: number } | null {
  if (!key.getState(state)) return null;
  const sel = state.selection;
  return sel instanceof TextSelection && !sel.empty ? { from: sel.from, to: sel.to } : null;
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
    // The selection as it was when a right-click began on it.
    let pressed: { doc: PMNode; anchor: number; head: number } | null = null;
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
              pressed = null;
              if (!isMenuPress(e)) return false;
              const sel = view.state.selection;
              if (!(sel instanceof TextSelection) || sel.empty) return false;
              const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
              if (!at || at.pos < sel.from || at.pos > sel.to) return false;
              // A right-click (or Control-click on a Mac) on the selected text: the Mac's engine
              // would move the caret there before the menu opens, clearing the selection. The
              // press is kept from doing anything, and the selection is noted to put back.
              pressed = { doc: view.state.doc, anchor: sel.anchor, head: sel.head };
              e.preventDefault();
              // On a Mac the menu opens while the button is still down, and letting go then
              // counts as a click in the selection, which the engine turns into a caret.
              const release = (up: MouseEvent) => {
                window.removeEventListener('mouseup', release, true);
                if (up.button === e.button) up.preventDefault();
              };
              window.addEventListener('mouseup', release, true);
              return true;
            },
            contextmenu(view) {
              // If the selection went anyway between the press and the menu, it comes back.
              const was = pressed;
              pressed = null;
              const sel = view.state.selection;
              if (was && was.doc === view.state.doc && (sel.anchor !== was.anchor || sel.head !== was.head)) {
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, was.anchor, was.head)).setMeta('addToHistory', false));
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
