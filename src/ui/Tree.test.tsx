// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Tree } from './Tree';
import { type CardSummary } from '../storage/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  act(() => roots.splice(0).forEach((r) => r.unmount()));
  document.body.innerHTML = '';
});

const card = (title: string, words: number) => ({ id: title, title, kind: 'scene', words }) as CardSummary;

function shelf() {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  roots.push(root);
  const nodes = [
    {
      name: 'Part One',
      path: 'bookshelf/Part One',
      kind: 'folder' as const,
      children: [
        { name: 'One.md', path: 'bookshelf/Part One/One.md', kind: 'file' as const },
        { name: 'Two.md', path: 'bookshelf/Part One/Two.md', kind: 'file' as const },
      ],
    },
  ];
  const cards = new Map([
    ['bookshelf/Part One/One.md', card('One', 1200)],
    ['bookshelf/Part One/Two.md', card('Two', 34)],
  ]);
  act(() =>
    root.render(
      <Tree
        nodes={nodes}
        root="bookshelf"
        selected={null}
        cards={cards}
        live={null}
        collapseKey="test.collapsed"
        renaming={null}
        onSelect={() => {}}
        onMove={() => {}}
        onStartRename={() => {}}
        onRename={() => {}}
      />,
    ),
  );
  return host;
}

describe('the Shelf', () => {
  it('shows a Group’s word count on hover, not at the end of its row', () => {
    const host = shelf();
    const group = host.querySelector<HTMLElement>('.tree-folder')!;
    expect(group.title).toBe('Part One: 1,234 words');
    expect(group.querySelector('.tree-words')).toBeNull();
  });

  it('keeps each Item’s own count on its row', () => {
    const host = shelf();
    expect([...host.querySelectorAll('.tree-card .tree-words')].map((e) => e.textContent)).toEqual(['1,200', '34']);
  });
});
