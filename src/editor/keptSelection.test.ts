// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';

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
