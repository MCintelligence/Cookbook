// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { openBook, readDocument, readTree, walkFiles } from './book';
import { loadOrder } from './order';
import { relationshipsOf } from './document';
import { parseMarkdown, plainText, type NodeJSON } from '../editor/markdown';
import { FIRST_ITEM, LEARN_TO_COOK, learnToCookLocation, learnedBefore, makeLearnToCook, rememberLearnToCook, shelfOf } from './learnToCook';

const mac = (id: string) => ({ palette: '⌘K', switcher: '⌘O', find: '⌘F', focus: '⇧⌘F', mise: '⇧⌘G' })[id] ?? '';

async function made() {
  const fs = new MemoryAdapter();
  const info = await makeLearnToCook(fs, mac);
  return { fs, info };
}

const texts = (node: NodeJSON): NodeJSON[] => (node.text !== undefined ? [node] : (node.content ?? []).flatMap(texts));

describe('Learn to Cook', () => {
  it('is a recipe with one Group for each part of Cookbook, in order, opening at Welcome', async () => {
    const { fs, info } = await made();
    expect((await openBook(fs)).title).toBe(LEARN_TO_COOK);
    expect(info.seasonings?.chosen).toEqual(['sam']);
    const tree = await readTree(fs, 'bookshelf', await loadOrder(fs));
    expect(tree.map((n) => n.name)).toEqual(shelfOf(mac).map((g) => g.title));
    expect(tree.every((n) => n.kind === 'folder' && (n.children?.length ?? 0) > 0)).toBe(true);
    expect(walkFiles(tree).next().value?.path).toBe(FIRST_ITEM);
    // Daniel's page is a real one.
    expect(await fs.exists(info.seasonings!.tracked[0]!)).toBe(true);
  });

  it('writes every page so it reads back as written, with no gaps where a shortcut was', async () => {
    const { fs } = await made();
    for (const file of walkFiles(await readTree(fs, 'bookshelf'))) {
      const doc = await readDocument(fs, file.path);
      expect(doc.kind).toBe('scene');
      expect(doc.fields.synopsis).toBeTruthy();
      expect(doc.body).not.toMatch(/undefined|\$\{| \(\)|with \.|press \./);
      expect(plainText(doc.body).length).toBeGreaterThan(100);
    }
    const typing = await readDocument(fs, 'bookshelf/Writing/Typing and formatting.md');
    const code = texts(parseMarkdown(typing.body)).filter((t) => t.marks?.some((m) => m.type === 'code')).map((t) => t.text);
    expect(code).toContain('**bold**');
  });

  it('uses the writer’s own shortcuts, and the menus where there are none', async () => {
    const { fs } = await made();
    const search = (await readDocument(fs, 'bookshelf/Finding your way/Search and shortcuts.md')).body;
    expect(search).toContain('press ⌘K');
    const bare = new MemoryAdapter();
    await makeLearnToCook(bare, () => '');
    const plain = (await readDocument(bare, 'bookshelf/Finding your way/Search and shortcuts.md')).body;
    expect(plain).toContain('open it from Help › Command palette');
  });

  it('explains Mise en Place on the Shelf’s own pages, so clicking The Shelf shows it at work', async () => {
    const { fs } = await made();
    expect(shelfOf(mac).find((g) => g.title === 'The Shelf')!.items.map((i) => i.title)).toContain('Mise en Place');
    const mise = (await readDocument(fs, 'bookshelf/The Shelf/Mise en Place.md')).body;
    expect(mise).toContain('**⇧⌘G** switches');
    expect(mise).toContain('find a Group by name: press ⌘O');
    const bare = new MemoryAdapter();
    await makeLearnToCook(bare, () => '');
    expect((await readDocument(bare, 'bookshelf/The Shelf/Mise en Place.md')).body).toContain('View › **Mise en Place** switches');
    expect((await readDocument(fs, 'bookshelf/Start here/Welcome.md')).body).toContain('Click the name of the next Group, **The Shelf**');
  });

  it('fills the Pantry with linked characters, a place and a research note', async () => {
    const { fs } = await made();
    const lou = await readDocument(fs, 'pantry/characters/Mama Lou.md');
    const june = await readDocument(fs, 'pantry/characters/June.md');
    expect(relationshipsOf(lou.fields)).toEqual([{ to: june.id, as: 'Mother of' }]);
    expect(relationshipsOf(june.fields)).toEqual([{ to: lou.id, as: 'Daughter of' }]);
    expect((await readDocument(fs, 'pantry/settings/Kitchen.md')).kind).toBe('setting');
    expect((await readDocument(fs, 'pantry/research/Research notes.md')).kind).toBe('research');
  });

  it('remembers where it was made, so Help can open it again', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(learnedBefore(storage)).toBe(false);
    expect(learnToCookLocation(storage)).toBeNull();
    rememberLearnToCook({ kind: 'browser', name: 'Learn to Cook' }, storage);
    expect(learnedBefore(storage)).toBe(true);
    expect(learnToCookLocation(storage)).toEqual({ kind: 'browser', name: 'Learn to Cook' });
  });
});
