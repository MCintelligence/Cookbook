import { afterEach, describe, expect, it } from 'vitest';
import { type Kept, boardHistory } from './boardUndo';
import { DEFAULT_PREFS, prefsStore, setPrefs } from './prefs';

const spotOf = (id: string) => prefsStore.get().spots.board?.[id];
const move = (id: string, x: number, y: number) => setPrefs((now) => ({ spots: { ...now.spots, board: { ...(now.spots.board ?? {}), [id]: [x, y] } } }));

describe('board undo', () => {
  let stop = () => {};
  afterEach(() => {
    stop();
    prefsStore.set(DEFAULT_PREFS);
  });

  it('steps back and forward through moves, and a new move clears the steps ahead', () => {
    prefsStore.set(DEFAULT_PREFS);
    const h = boardHistory('board', ['spots', 'lines', 'looks']);
    stop = h.stop;
    move('a', 10, 10);
    move('a', 20, 20);
    move('b', 5, 5);
    expect(h.undo()).toBe(true);
    expect(spotOf('b')).toBeUndefined();
    expect(h.undo()).toBe(true);
    expect(spotOf('a')).toEqual([10, 10]);
    expect(h.redo()).toBe(true);
    expect(spotOf('a')).toEqual([20, 20]);
    move('c', 1, 1);
    expect(h.redo()).toBe(false);
    h.undo();
    h.undo();
    h.undo();
    expect(prefsStore.get().spots.board).toBeUndefined();
    expect(h.undo()).toBe(false);
  });

  it('leaves other boards and other settings alone', () => {
    prefsStore.set(DEFAULT_PREFS);
    const h = boardHistory('board', ['spots']);
    stop = h.stop;
    setPrefs({ plotlines: { red: 'Murder' } });
    setPrefs((now) => ({ spots: { ...now.spots, atlas: { x: [1, 1] } } }));
    expect(h.undo()).toBe(false);
    move('a', 3, 3);
    setPrefs((now) => ({ spots: { ...now.spots, atlas: { x: [2, 2] } } }));
    h.undo();
    expect(spotOf('a')).toBeUndefined();
    expect(prefsStore.get().spots.atlas).toEqual({ x: [2, 2] });
    expect(prefsStore.get().plotlines).toEqual({ red: 'Murder' });
  });

  it('forgets the steps when another recipe is read in', () => {
    prefsStore.set(DEFAULT_PREFS);
    const h = boardHistory('board', ['spots']);
    stop = h.stop;
    move('a', 3, 3);
    prefsStore.set({ ...DEFAULT_PREFS, spots: { board: { z: [9, 9] } } });
    expect(h.undo()).toBe(false);
    expect(spotOf('z')).toEqual([9, 9]);
  });
});

describe('board-only cards in modes.json', () => {
  it('keeps well-formed board cards and drops the rest', async () => {
    const { readPrefs } = await import('./prefs');
    const read = readPrefs(JSON.stringify({ notes: { board: { 'note-a': { title: 'Idea', text: 'More' }, 'note-b': { title: 'Bare', text: '' }, x: { title: 'Not a note id' }, 'note-c': { text: 'no title' } }, pboard: 'nonsense' } }));
    expect(read.notes).toEqual({ board: { 'note-a': { title: 'Idea', text: 'More' }, 'note-b': { title: 'Bare' } } });
    expect(readPrefs('{}').notes).toEqual({});
  });

  it('puts a deleted board card and an Item taken off the board back in one step', () => {
    prefsStore.set(DEFAULT_PREFS);
    const kept: Kept[] = ['spots', 'lines', 'looks', 'notes', ['hidden', 'prep']];
    const h = boardHistory('board', kept);
    setPrefs({ notes: { board: { 'note-a': { title: 'Idea' } } }, spots: { board: { 'note-a': [1, 2] } } });
    setPrefs((now) => ({ notes: { board: {} }, spots: { board: {} }, hidden: { ...now.hidden, prep: ['item-1'] } }));
    expect(h.undo()).toBe(true);
    expect(prefsStore.get().notes.board).toEqual({ 'note-a': { title: 'Idea' } });
    expect(prefsStore.get().spots.board).toEqual({ 'note-a': [1, 2] });
    expect(prefsStore.get().hidden.prep).toEqual([]);
    h.stop();
  });
});
