import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './chapters';
import { findIn, shortcutsChapter, withKeys } from '../ui/Manual';
import { SHORTCUTS } from '../shortcuts';

describe('the manual', () => {
  it('names only shortcuts that exist', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id));
    for (const c of CHAPTERS) for (const [, id] of c.body.matchAll(/\{key:(\w+)/g)) expect(ids.has(id!), `${c.id}: ${id}`).toBe(true);
  });

  it('says the writer’s own shortcut, or the way round when they took it off', () => {
    expect(withKeys('Press {key:find|Edit › Search}.', () => 'Ctrl+F')).toBe('Press Ctrl+F.');
    expect(withKeys('Press {key:find|Edit › Search}.', () => '')).toBe('Press Edit › Search.');
  });

  it('uses the names the app uses now', () => {
    const all = CHAPTERS.map((c) => c.body).join('\n');
    expect(all).not.toMatch(/Read the recipe|Pantry › Research|Places and Research|(?<!Cookbook )Settings › |\bStudy mode/);
    expect(all).toMatch(/Cookbook Settings › Writing/);
  });

  it('has a unique id for every chapter', () => {
    const ids = [...CHAPTERS.map((c) => c.id), shortcutsChapter(() => '').id];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds every word of a search, with a snippet', () => {
    const plate = CHAPTERS.find((c) => c.id === 'plate')!;
    expect(findIn(plate, 'trim size')).toMatch(/trim size/);
    expect(findIn(plate, 'trim zebra')).toBeNull();
    expect(findIn(plate, '')).toBeNull();
  });

  it('lists every shortcut', () => {
    const c = shortcutsChapter((id) => (id === 'find' ? 'Ctrl+F' : ''));
    expect(c.body).toMatch(/\| Search \| Ctrl\+F \|/);
    expect(c.body.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Command')).length).toBe(SHORTCUTS.length);
  });
});
