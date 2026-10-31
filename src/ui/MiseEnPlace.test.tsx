// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type Editor } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import { PageEditor } from '../editor/PageEditor';
import { MemoryAdapter } from '../storage/memory';
import { type TreeNode, readDocument, writeDocument } from '../storage/book';
import { MiseEnPlace } from './MiseEnPlace';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom draws nothing, so ProseMirror's scrolling and measuring are left out.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.scrollTo ??= () => {};
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
document.elementFromPoint ??= () => null;

const roots: Root[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.innerHTML = '';
});

const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

async function shelfFs() {
  const fs = new MemoryAdapter();
  await fs.makeFolder('bookshelf');
  await fs.makeFolder('bookshelf/Part One');
  return fs;
}

async function item(fs: MemoryAdapter, path: string, body: string) {
  await writeDocument(fs, path, { id: path, title: path.split('/').pop()!.replace(/\.md$/, ''), kind: 'scene', fields: {}, body });
}

const group = (paths: string[]): TreeNode => ({
  name: 'Part One',
  path: 'bookshelf/Part One',
  kind: 'folder',
  children: paths.map((p) => ({ name: p.split('/').pop()!, path: p, kind: 'file' as const })),
});

/** Mise en Place as the app puts it together: the active Item gets a real editor. */
function mount(fs: MemoryAdapter, start: { group: TreeNode; active: string | null }, hooks: { onStartWriting?: (made: (p: string) => void) => Promise<string | null>; onDiscard?: (p: string) => void } = {}) {
  const host = document.body.appendChild(document.createElement('div'));
  host.className = 'desk';
  const root = createRoot(host);
  roots.push(root);
  let set: (s: typeof start) => void = () => {};
  let editor: Editor | null = null;
  function Harness() {
    const [state, setState] = useState(start);
    const [ed, setEd] = useState<Editor | null>(null);
    const [body, setBody] = useState<string | null>(null);
    set = setState;
    editor = ed;
    // The active Item's body is read before its editor is drawn, as select() does.
    if (state.active && body === null) void readDocument(fs, state.active).then((d) => setBody(d.body));
    return (
      <MiseEnPlace
        fs={fs}
        group={state.group}
        active={body === null ? null : state.active}
        editor={ed}
        cards={new Map()}
        className="cb-page"
        style={{}}
        renderActive={() => <PageEditor key={state.active} initialBody={body ?? ''} undoLog={null} onRecorder={() => {}} nextStyle={(s) => s} onReady={setEd} onChange={() => {}} onSeasonings={() => {}} />}
        onActivate={(p) => {
          setBody(null);
          setState((s) => ({ ...s, active: p }));
        }}
        onStartWriting={hooks.onStartWriting ?? (async () => null)}
        onDiscard={hooks.onDiscard ?? (() => {})}
        onPageMenu={() => {}}
        onItemMenu={() => {}}
      />
    );
  }
  act(() => root.render(<Harness />));
  return { host, set: (s: typeof start) => act(() => set(s)), editor: () => editor };
}

const textOf = (host: HTMLElement, path: string) => host.querySelector(`[data-path="${path}"] .ms-text`)?.textContent ?? null;

describe('Mise en Place', () => {
  it('draws the other Items as text, with the active one in an editor', async () => {
    const fs = await shelfFs();
    await item(fs, 'bookshelf/Part One/One.md', 'The first.');
    await item(fs, 'bookshelf/Part One/Two.md', 'The second.');
    const m = mount(fs, { group: group(['bookshelf/Part One/One.md', 'bookshelf/Part One/Two.md']), active: 'bookshelf/Part One/One.md' });
    await settle();
    expect(m.editor()?.getText()).toBe('The first.');
    expect(textOf(m.host, 'bookshelf/Part One/Two.md')).toBe('The second.');
  });

  it('reads an Item afresh when a new one is made with the name of one that went away', async () => {
    const fs = await shelfFs();
    await item(fs, 'bookshelf/Part One/One.md', 'The first.');
    await item(fs, 'bookshelf/Part One/Two.md', 'Old words.');
    const m = mount(fs, { group: group(['bookshelf/Part One/One.md', 'bookshelf/Part One/Two.md']), active: 'bookshelf/Part One/One.md' });
    await settle();
    expect(textOf(m.host, 'bookshelf/Part One/Two.md')).toBe('Old words.');
    m.set({ group: group(['bookshelf/Part One/One.md']), active: 'bookshelf/Part One/One.md' });
    await settle();
    await item(fs, 'bookshelf/Part One/Two.md', 'New words.');
    m.set({ group: group(['bookshelf/Part One/One.md', 'bookshelf/Part One/Two.md']), active: 'bookshelf/Part One/One.md' });
    await settle();
    expect(textOf(m.host, 'bookshelf/Part One/Two.md')).toBe('New words.');
  });

  it('starts the first Item from words typed into an empty Group, keeping those typed while it was made', async () => {
    const fs = await shelfFs();
    const made = 'bookshelf/Part One/New item.md';
    let calls = 0;
    let finish: () => void = () => {};
    const m = mount(
      fs,
      { group: group([]), active: null },
      {
        onStartWriting: async (onMade) => {
          calls++;
          await item(fs, made, '');
          onMade(made);
          await new Promise<void>((r) => (finish = r));
          return made;
        },
      },
    );
    const blank = m.host.querySelector<HTMLElement>('.mise-blank')!;
    const type = (text: string) =>
      act(() => {
        blank.textContent = text;
        blank.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
    type('Once');
    await settle();
    // The Item is on the Shelf now, but its editor isn't ready: the empty page keeps taking letters.
    m.set({ group: group([made]), active: null });
    type('Once upon');
    await settle();
    expect(calls).toBe(1);
    expect(m.host.querySelector('.mise-blank')).not.toBeNull();
    expect(m.host.querySelector(`[data-path="${made}"]`)).toBeNull();
    m.set({ group: group([made]), active: made });
    await settle();
    await act(async () => finish());
    await settle();
    expect(m.editor()?.getText()).toBe('Once upon');
    expect(m.host.querySelector('.mise-blank')).toBeNull();
  });

  it('takes a new Item away on Undo only once it is empty again', async () => {
    const fs = await shelfFs();
    const made = 'bookshelf/Part One/New item.md';
    const discarded: string[] = [];
    const m = mount(
      fs,
      { group: group([]), active: null },
      {
        onStartWriting: async (onMade) => {
          await item(fs, made, '');
          onMade(made);
          return made;
        },
        onDiscard: (p) => discarded.push(p),
      },
    );
    const blank = m.host.querySelector<HTMLElement>('.mise-blank')!;
    act(() => {
      blank.textContent = 'Hello';
      blank.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await settle();
    m.set({ group: group([made]), active: made });
    await settle();
    const ed = m.editor()!;
    expect(ed.getText()).toBe('Hello');
    const undo = () => act(() => ed.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true })));
    // Nothing left to undo, as if the history couldn't be kept, but the words are there: the Item stays.
    const fresh = (doc: typeof ed.state.doc) => act(() => ed.view.updateState(EditorState.create({ doc, plugins: ed.state.plugins })));
    fresh(ed.state.doc);
    undo();
    expect(discarded).toEqual([]);
    fresh(ed.schema.topNodeType.createAndFill()!);
    undo();
    expect(discarded).toEqual([made]);
  });
});

describe('Mise en Place from the keyboard', () => {
  it('leaves the keyboard on the Shelf when an empty Group is opened from it', async () => {
    const fs = await shelfFs();
    const shelfRow = document.body.appendChild(document.createElement('button'));
    shelfRow.focus();
    const m = mount(fs, { group: group([]), active: null });
    await settle();
    expect(document.activeElement).toBe(shelfRow);
    expect(m.host.querySelector('.mise-blank')).not.toBeNull();
  });

  it('gives the empty page the keyboard when nothing else has it, as after Undo takes a new Item away', async () => {
    const fs = await shelfFs();
    (document.activeElement as HTMLElement | null)?.blur();
    const m = mount(fs, { group: group([]), active: null });
    await settle();
    expect(document.activeElement).toBe(m.host.querySelector('.mise-blank'));
  });

  it('gives each Item a heading, opens one with Enter and says which Item the editor moved into', async () => {
    const fs = await shelfFs();
    await item(fs, 'bookshelf/Part One/One.md', 'The first.');
    await item(fs, 'bookshelf/Part One/Two.md', 'The second.');
    const m = mount(fs, { group: group(['bookshelf/Part One/One.md', 'bookshelf/Part One/Two.md']), active: 'bookshelf/Part One/One.md' });
    await settle();
    expect([...m.host.querySelectorAll('h3.mise-item-name')].map((h) => h.textContent)).toEqual(['One', 'Two']);
    const two = m.host.querySelector<HTMLElement>('[data-path="bookshelf/Part One/Two.md"]')!;
    expect(two.tabIndex).toBe(0);
    expect(two.getAttribute('aria-describedby')).toBe('mise-item-hint');
    act(() => two.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    await settle();
    expect(m.editor()?.getText()).toBe('The second.');
    expect(m.host.querySelector('.sr-only')?.textContent).toBe('Two, item 2 of 2');
  });
});

describe('the page editor made again for the same Item', () => {
  it('starts from the text as it is now, not as the Item was opened', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    roots.push(root);
    let editor: Editor | null = null;
    act(() =>
      root.render(
        <PageEditor
          initialBody="As opened."
          undoLog={null}
          takeOver={() => ({ initialBody: 'As typed since.', undoLog: null })}
          onRecorder={() => {}}
          nextStyle={(s) => s}
          onReady={(e) => (editor = e)}
          onChange={() => {}}
          onSeasonings={() => {}}
        />,
      ),
    );
    await settle();
    expect((editor as Editor | null)?.getText()).toBe('As typed since.');
  });
});
