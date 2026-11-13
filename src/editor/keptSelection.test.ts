// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { cookbookExtensions } from './extensions';
import { isMenuPress } from './keptSelection';

const editors: Editor[] = [];
// The app window has focus, as it does when someone right-clicks in it.
beforeEach(() => void vi.spyOn(document, 'hasFocus').mockReturnValue(true));
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function setup() {
  const host = document.createElement('div');
  const menu = document.createElement('ul');
  menu.setAttribute('role', 'menu');
  const item = document.createElement('button');
  const elsewhere = document.createElement('button');
  menu.append(item);
  document.body.append(host, menu, elsewhere);
  const editor = new Editor({
    element: host,
    extensions: cookbookExtensions((s) => s),
    content: '<p>Keep this selected</p>',
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from: 1, to: 5 });
  return { editor, item, elsewhere };
}

const blur = (editor: Editor, to: Element) => editor.view.dom.dispatchEvent(new FocusEvent('blur', { relatedTarget: to }));
const kept = (editor: Editor) => editor.view.dom.querySelectorAll('.cb-kept-selection').length;

describe('the selection while a menu is open', () => {
  it('stays highlighted when a right-click menu takes the keyboard', () => {
    const { editor, item } = setup();
    blur(editor, item);
    expect(kept(editor)).toBe(1);
    expect(editor.view.dom.querySelector('.cb-kept-selection')?.textContent).toBe('Keep');
    expect(editor.view.dom.classList.contains('cb-keeps-selection')).toBe(true);
  });

  it('lets go when the page has the keyboard again', () => {
    const { editor, item } = setup();
    blur(editor, item);
    editor.view.dom.dispatchEvent(new FocusEvent('focus'));
    expect(kept(editor)).toBe(0);
    expect(editor.view.dom.classList.contains('cb-keeps-selection')).toBe(false);
  });

  it('lets go when the keyboard goes somewhere else', () => {
    const { editor, item, elsewhere } = setup();
    blur(editor, item);
    elsewhere.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(kept(editor)).toBe(0);
  });

  it('is not kept when the focus leaves for anything but a menu or the toolbar', () => {
    const { editor, elsewhere } = setup();
    blur(editor, elsewhere);
    expect(kept(editor)).toBe(0);
  });

  it('is not kept when the person switches to another app', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const { editor, item } = setup();
    blur(editor, item);
    expect(kept(editor)).toBe(0);
  });

  it('draws nothing for an empty selection', () => {
    const { editor, item } = setup();
    editor.commands.setTextSelection(3);
    blur(editor, item);
    expect(kept(editor)).toBe(0);
  });
});

describe('after Select all', () => {
  it('stays highlighted while the menu is open', () => {
    const { editor, item } = setup();
    editor.commands.selectAll();
    blur(editor, item);
    expect(editor.view.dom.querySelector('.cb-kept-selection')?.textContent).toBe('Keep this selected');
  });
});

describe('a right-click that lands on the selection', () => {
  const press = (editor: Editor, pos: number, button = 2) => {
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos, inside: -1 });
    editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true, cancelable: true }));
  };
  const up = (button = 2) => window.dispatchEvent(new MouseEvent('mouseup', { button }));
  const caret = (editor: Editor, at: number) => editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
  const range = (editor: Editor) => [editor.state.selection.from, editor.state.selection.to];

  it('is not moved by the engine before the menu opens', () => {
    const { editor } = setup();
    press(editor, 3);
    caret(editor, 3); // the Mac's engine putting a caret where the click landed
    editor.view.dom.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true }));
    expect(range(editor)).toEqual([1, 5]);
  });

  it('is not moved when the button comes up just after', () => {
    const { editor } = setup();
    press(editor, 3);
    up();
    caret(editor, 3);
    expect(range(editor)).toEqual([1, 5]);
  });

  it('can move again once the menu has settled', () => {
    const { editor } = setup();
    const now = Date.now();
    press(editor, 3);
    up();
    vi.spyOn(Date, 'now').mockReturnValue(now + 2000);
    caret(editor, 3);
    expect(range(editor)).toEqual([3, 3]);
  });

  it('keeps Select all too', () => {
    const { editor } = setup();
    editor.commands.selectAll();
    press(editor, 8);
    caret(editor, 8);
    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.to - editor.state.selection.from).toBe(editor.state.doc.content.size);
  });

  it('lets a right-click outside the selection move the caret', () => {
    const { editor } = setup();
    press(editor, 12);
    caret(editor, 12);
    expect(range(editor)).toEqual([12, 12]);
  });

  it('lets text change, as Cut from the menu does', () => {
    const { editor } = setup();
    press(editor, 3);
    editor.commands.deleteSelection();
    expect(editor.state.doc.textContent).toBe(' this selected');
  });

  it('takes in a selection the page shows but the editor missed', () => {
    const { editor } = setup();
    caret(editor, 3);
    const text = editor.view.dom.querySelector('p')!.firstChild!;
    const dom = document.getSelection()!;
    dom.removeAllRanges();
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 4);
    dom.addRange(r);
    vi.spyOn(dom, 'isCollapsed', 'get').mockReturnValue(false);
    press(editor, 2);
    expect(range(editor)).toEqual([1, 5]);
  });

  it('counts the right button and, on a Mac, Control-click', () => {
    expect(isMenuPress(new MouseEvent('mousedown', { button: 2 }), false)).toBe(true);
    expect(isMenuPress(new MouseEvent('mousedown', { button: 0, ctrlKey: true }), true)).toBe(true);
    expect(isMenuPress(new MouseEvent('mousedown', { button: 0, ctrlKey: true }), false)).toBe(false);
    expect(isMenuPress(new MouseEvent('mousedown', { button: 0 }), true)).toBe(false);
  });
});
