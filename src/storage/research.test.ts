import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8 } from 'fflate';
import { MemoryAdapter } from './memory';
import { createBook, createDocument, readDocument, writeDocument } from './book';
import { BookIndex, refreshIndex } from './index';
import { addResearchFile, keepResearchFile, kindName, mimeOf, readBinaryPlist, readWebArchive, researchKind, titleOfAddress, titleOfFile, webAddress } from './research';

/** A small binary property list writer, enough to make a Safari web archive for the tests. */
type Value = string | number | boolean | Uint8Array | Value[] | { [key: string]: Value };
function bplist(root: Value): Uint8Array {
  const objects: Uint8Array[] = [];
  const marker = (type: number, n: number): number[] => (n < 15 ? [(type << 4) | n] : [(type << 4) | 0xf, 0x11, n >> 8, n & 0xff]);
  const add = (v: Value): number => {
    const at = objects.length;
    objects.push(new Uint8Array());
    let bytes: number[];
    if (typeof v === 'boolean') bytes = [v ? 0x09 : 0x08];
    else if (typeof v === 'number') bytes = [0x11, v >> 8, v & 0xff];
    else if (typeof v === 'string') bytes = [...marker(0x5, v.length), ...strToU8(v, true)];
    else if (v instanceof Uint8Array) bytes = [...marker(0x4, v.length), ...v];
    else if (Array.isArray(v)) {
      const refs = v.map(add);
      bytes = [...marker(0xa, refs.length), ...refs.flatMap((r) => [r >> 8, r & 0xff])];
    } else {
      const keys = Object.keys(v).map(add);
      const vals = Object.values(v).map(add);
      bytes = [...marker(0xd, keys.length), ...[...keys, ...vals].flatMap((r) => [r >> 8, r & 0xff])];
    }
    objects[at] = new Uint8Array(bytes);
    return at;
  };
  add(root);
  const head = strToU8('bplist00');
  const offsets: number[] = [];
  let at = head.length;
  for (const o of objects) {
    offsets.push(at);
    at += o.length;
  }
  const table = offsets.flatMap((o) => [(o >> 24) & 0xff, (o >> 16) & 0xff, (o >> 8) & 0xff, o & 0xff]);
  const trailer = new Uint8Array(32);
  const view = new DataView(trailer.buffer);
  trailer[6] = 4;
  trailer[7] = 2;
  view.setBigUint64(8, BigInt(objects.length));
  view.setBigUint64(16, 0n);
  view.setBigUint64(24, BigInt(at));
  const out = new Uint8Array(at + table.length + 32);
  out.set(head, 0);
  let p = head.length;
  for (const o of objects) {
    out.set(o, p);
    p += o.length;
  }
  out.set(table, p);
  out.set(trailer, p + table.length);
  return out;
}

describe('Research files', () => {
  it('knows how to show each kind of file', () => {
    expect(['Map.PNG', 'scan.pdf', 'page.webarchive', 'Song.m4a', 'clip.mov', 'notes.scrivx'].map(researchKind)).toEqual(['picture', 'pdf', 'web', 'sound', 'film', 'other']);
    expect(kindName('a.pdf')).toBe('PDF');
    expect(kindName('a.key')).toBe('KEY file');
    expect(mimeOf('a.JPG')).toBe('image/jpeg');
    expect(mimeOf('a.unknown')).toBe('application/octet-stream');
  });

  it('keeps a file in files/ and makes the Item that shows it', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    const a = await addResearchFile(fs, 'research', 'Old menu.pdf', strToU8('%PDF-1.4'));
    const b = await addResearchFile(fs, 'research', 'Old menu.pdf', strToU8('%PDF-1.7'), { title: 'Old menu', body: 'Check the year.\n' });
    expect([a, b]).toEqual(['research/Old menu.md', 'research/Old menu 2.md']);
    expect(await readDocument(fs, a)).toMatchObject({ title: 'Old menu', kind: 'scene', fields: { file: 'files/Old menu.pdf' } });
    expect(await readDocument(fs, b)).toMatchObject({ fields: { file: 'files/Old menu 2.pdf' }, body: 'Check the year.\n' });
    expect(strFromU8(await fs.readBytes('files/Old menu 2.pdf'))).toBe('%PDF-1.7');
  });

  it('keeps a file added to a note, named after the note', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    expect(titleOfFile('Harbour map.JPG')).toBe('Harbour map');
    expect(titleOfFile('.jpg')).toBe('Untitled');
    expect(await keepResearchFile(fs, 'IMG_1.jpg', 'Harbour', strToU8('x'))).toBe('files/Harbour.jpg');
    expect(await keepResearchFile(fs, 'IMG_2.jpg', 'Harbour', strToU8('y'))).toBe('files/Harbour 2.jpg');
  });

  it('reads a web address as typed, pasted or dropped', () => {
    expect(webAddress('example.com/a/b')).toBe('https://example.com/a/b');
    expect(webAddress('  http://example.org  ')).toBe('http://example.org/');
    expect(webAddress('javascript:alert(1)')).toBeNull();
    expect(webAddress('file:///etc/passwd')).toBeNull();
    expect(webAddress('just words')).toBeNull();
    expect(webAddress('word')).toBeNull();
    expect(titleOfAddress('https://www.example.com/wiki/Salt_cod.html')).toBe('example.com · Salt cod');
    expect(titleOfAddress('https://example.com/')).toBe('example.com');
  });

  it('reads a Safari web archive with the pictures saved in it', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const archive = bplist({
      WebMainResource: { WebResourceURL: 'https://example.com/cornbread', WebResourceMIMEType: 'text/html', WebResourceTextEncodingName: 'UTF-8', WebResourceData: strToU8('<p>Corn<img src="a.png"></p>') },
      WebSubresources: [{ WebResourceURL: 'https://example.com/a.png', WebResourceMIMEType: 'image/png', WebResourceData: png }],
    });
    const read = readWebArchive(archive)!;
    expect(read.main).toMatchObject({ url: 'https://example.com/cornbread', mime: 'text/html', encoding: 'UTF-8' });
    expect(strFromU8(read.main.data)).toBe('<p>Corn<img src="a.png"></p>');
    expect(read.resources).toEqual([{ url: 'https://example.com/a.png', mime: 'image/png', encoding: null, data: png }]);
    expect(readBinaryPlist(bplist([true, 7, 'hi']))).toEqual([true, 7, 'hi']);
    expect(readWebArchive(strToU8('not a web archive'))).toBeNull();
    expect(readWebArchive(bplist({ WebMainResource: 'oops' }))).toBeNull();
  });

  it('keeps Research out of the book: searches, counts and names, unless asked', async () => {
    const fs = new MemoryAdapter();
    await createBook(fs, 'Book');
    await fs.makeFolder('research');
    const scene = await createDocument(fs, 'bookshelf', 'Sunday Dinner');
    const note = await createDocument(fs, 'research', 'Cornbread history');
    await writeDocument(fs, scene, { ...(await readDocument(fs, scene)), body: 'Lou baked cornbread.\n' });
    await writeDocument(fs, note, { ...(await readDocument(fs, note)), body: 'Lou says cornbread came first.\n' });
    const menu = await addResearchFile(fs, 'research', 'Old menu.pdf', strToU8('%PDF'));
    const index = await BookIndex.open();
    await refreshIndex(fs, index);
    expect(index.cards().get(menu)?.file).toBe('files/Old menu.pdf');
    expect(index.cards().get(note)?.file).toBe('');
    expect(index.search('cornbread').map((h) => h.path)).toEqual([scene]);
    expect(index.search('cornbread', { aside: true }).map((h) => h.path).sort()).toEqual([note, scene].sort());
    expect(index.scenesNaming(['Lou'], () => 1).map((m) => m.path)).toEqual([scene]);
    expect(index.pageTexts()).toEqual(['Lou baked cornbread.']);
    index.close();
  });
});
