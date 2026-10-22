import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { compareText, deleteSnapshot, listSnapshots, takeSnapshot } from './snapshots';

describe('snapshots', () => {
  it('keeps copies of a scene, newest first', async () => {
    const fs = new MemoryAdapter();
    const scene = { id: 'abc', title: 'Supper', body: 'Pie.\n' };
    await takeSnapshot(fs, scene, 'By hand', new Date(2026, 9, 22, 9));
    await takeSnapshot(fs, { ...scene, body: 'Pie and grits.\n' }, 'Before splitting', new Date(2026, 9, 22, 10));
    const list = await listSnapshots(fs, 'abc');
    expect(list.map((s) => [s.reason, s.body])).toEqual([
      ['Before splitting', 'Pie and grits.\n'],
      ['By hand', 'Pie.\n'],
    ]);
    await deleteSnapshot(fs, list[0]!);
    expect(await listSnapshots(fs, 'abc')).toHaveLength(1);
    expect(await listSnapshots(fs, 'other')).toEqual([]);
  });

  it('compares by paragraph, then by word', () => {
    const changes = compareText('June burned the rice.\n\nNobody spoke.', 'June burned the cornbread.\n\nNobody spoke.\n\nLou laughed.');
    expect(changes).toEqual([
      [
        { kind: 'same', text: 'June burned the ' },
        { kind: 'removed', text: 'rice.' },
        { kind: 'added', text: 'cornbread.' },
      ],
      [{ kind: 'same', text: 'Nobody spoke.' }],
      [{ kind: 'added', text: 'Lou laughed.' }],
    ]);
  });

  it('keeps paragraphs apart when they are one line each, as plain text gives them', () => {
    expect(compareText('One.\nTwo.', 'One.\nTwo. Three.')).toEqual([
      [{ kind: 'same', text: 'One.' }],
      [{ kind: 'same', text: 'Two.' }, { kind: 'added', text: ' Three.' }],
    ]);
  });
});
