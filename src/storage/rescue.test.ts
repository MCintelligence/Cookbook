import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { applyRescue, keepRescue, takeRescue, type Rescue } from './rescue';

function store() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const here = { kind: 'browser', name: 'My Book' } as const;
const saved = '---\nid: a1\ntitle: Sunday Dinner\nkind: scene\n---\nThe kitchen.\n';
const typed = '---\nid: a1\ntitle: Sunday Dinner\nkind: scene\n---\nThe kitchen. June burned the rice.\n';

describe('rescuing words a closing tab did not finish saving', () => {
  it('writes the last words back when the book opens again', async () => {
    const fs = new MemoryAdapter();
    await fs.makeFolder('bookshelf');
    await fs.writeText('bookshelf/sunday-dinner.md', saved);
    const s = store();
    keepRescue(s, { location: here, path: 'bookshelf/sunday-dinner.md', text: typed, base: saved });

    const rescue = takeRescue(s, here)!;
    expect(await applyRescue(fs, rescue)).toBe(true);
    expect(await fs.readText('bookshelf/sunday-dinner.md')).toBe(typed);
    expect(takeRescue(s, here)).toBeNull();
  });

  it('never overwrites a file that changed after the rescue was kept', async () => {
    const fs = new MemoryAdapter();
    await fs.makeFolder('bookshelf');
    const newer = saved.replace('The kitchen.', 'A newer kitchen.');
    await fs.writeText('bookshelf/sunday-dinner.md', newer);
    const rescue: Rescue = { location: here, path: 'bookshelf/sunday-dinner.md', text: typed, base: saved };
    expect(await applyRescue(fs, rescue)).toBe(false);
    expect(await fs.readText('bookshelf/sunday-dinner.md')).toBe(newer);
  });

  it('leaves a rescue for another book alone', () => {
    const s = store();
    keepRescue(s, { location: { kind: 'browser', name: 'Other' }, path: 'x.md', text: typed, base: saved });
    expect(takeRescue(s, here)).toBeNull();
    expect(takeRescue(s, { kind: 'browser', name: 'Other' })).not.toBeNull();
  });
});
