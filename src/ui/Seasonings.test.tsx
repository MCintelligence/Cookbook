// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Editor } from '@tiptap/core';
import type { Editor as ReactEditor } from '@tiptap/react';
import { cookbookExtensions } from '../editor/extensions';
import { Seasonings } from './Seasonings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const editors: Editor[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount());
  editors.splice(0).forEach((e) => e.destroy());
  document.body.innerHTML = '';
});

const noop = () => {};
const panel = (editor: Editor | null) => (
  <Seasonings
    editor={editor as ReactEditor | null}
    chosen={['sam']}
    onChosen={noop}
    unchecked={[]}
    onUnchecked={noop}
    onDrunk={noop}
    onClose={noop}
    paused={false}
    onPaused={noop}
    onMenu={noop}
    onReport={noop}
  />
);

describe('Seasonings panel', () => {
  // Opening a Group as Mise en Place takes the editor away while the panel is open. A hook
  // after the panel's early return made React throw and the whole window went blank.
  it('survives its editor going away and coming back', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const editor = new Editor({ element: document.createElement('div'), extensions: cookbookExtensions((s) => s), content: '<p>Some words to taste.</p>' });
    editors.push(editor);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(panel(editor)));
    expect(host.textContent).not.toBe('');
    expect(() => act(() => root.render(panel(null)))).not.toThrow();
    expect(host.textContent).toBe('');
    expect(() => act(() => root.render(panel(editor)))).not.toThrow();
    expect(host.textContent).not.toBe('');
  });
});
