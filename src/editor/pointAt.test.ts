// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { posAtPoint } from './pointAt';

const editors: Editor[] = [];
afterEach(() => {
  editors.splice(0).forEach((e) => e.destroy());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
  delete (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint;
});

function setup() {
  const host = document.createElement('div');
  document.body.append(host);
  const editor = new Editor({ element: host, extensions: cookbookExtensions((s) => s), content: '<p>Keep this selected</p>' });
  editors.push(editor);
  const text = editor.view.dom.querySelector('p')!.firstChild!;
  return { editor, text };
}

describe('the position under a click', () => {
  it("trusts the engine's own hit test over measuring, which a zoomed page throws off", () => {
    const { editor, text } = setup();
    // Measuring would say the end of the paragraph, as it did on the 110% page.
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 19, inside: -1 });
    (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(text, 2);
      return r;
    };
    expect(posAtPoint(editor.view, 10, 10)).toBe(3);
  });

  it('uses the standard caret lookup where there is one', () => {
    const { editor, text } = setup();
    (document as { caretPositionFromPoint?: unknown }).caretPositionFromPoint = () => ({ offsetNode: text, offset: 5 });
    expect(posAtPoint(editor.view, 10, 10)).toBe(6);
  });

  it('falls back to measuring when the point is not on the page', () => {
    const { editor } = setup();
    const outside = document.createElement('div');
    document.body.append(outside);
    (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint = () => {
      const r = document.createRange();
      r.setStart(outside, 0);
      return r;
    };
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 7, inside: -1 });
    expect(posAtPoint(editor.view, 10, 10)).toBe(7);
  });
});
