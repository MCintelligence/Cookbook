import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { MemoryAdapter } from './memory';
import { openBook, readDocument, readTree } from './book';
import { loadOrder } from './order';
import { decodeRtf, rtfToContent } from './rtf';
import { filesSource, findProject, importScrivener, isScrivenerZip, nearestLabel, parseScrivx, statusFrom, zipSource } from './scrivener';
import { serializeMarkdown } from '../editor/markdown';

// Only the XML parser is borrowed from jsdom; a whole jsdom window gives zips a second, foreign Uint8Array.
// @ts-expect-error jsdom ships without type declarations.
const { JSDOM } = (await import('jsdom')) as { JSDOM: new () => { window: { DOMParser: typeof DOMParser } } };
globalThis.DOMParser ??= new JSDOM().window.DOMParser;

const md = (rtf: string) => serializeMarkdown({ type: 'doc', content: rtfToContent(rtf) });

/** As Scrivener 3 on a Mac writes a document: Cocoa RTF, with a backslash ending each paragraph. */
const cocoa = (body: string) => `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2639
\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset0 Palatino-Roman;}
{\\colortbl;\\red255\\green255\\blue255;}
{\\*\\expandedcolortbl;;}
\\pard\\tx360\\fi360\\sl264\\slmult1\\pardirnatural\\partightenfactor0

\\f0\\fs26 \\cf0 ${body}}`;

describe('reading RTF', () => {
  it('keeps paragraphs, bold, italic, underline and strikethrough', () => {
    expect(md(cocoa('The kitchen smelled of {\\b cornbread}, and \\i flour\\i0 .\\\n\\ul Under\\ulnone  and \\strike struck\\strike0 .'))).toBe(
      'The kitchen smelled of **cornbread**, and *flour*.\n\n[Under]{.ul} and ~~struck~~.\n',
    );
  });

  it('reads escaped and Unicode characters', () => {
    expect(md(cocoa("Lou\\'92s pie \\uc0\\u8212  sweet\\u8230 \\'e9t\\'e9"))).toBe('Lou’s pie — sweet…été\n');
    // With \uc1 the character after \u is the stand-in for older readers, and is dropped.
    expect(md('{\\rtf1\\ansi\\uc1 caf\\u233 e}')).toBe('café\n');
    expect(md('{\\rtf1\\ansi \\{braces\\} and \\\\ slash}')).toBe('{braces} and \\\\ slash\n');
  });

  it('turns # and * * * lines into scene breaks, and \\line into a line break', () => {
    expect(md(cocoa('One.\\\n#\\\nTwo\\line three.'))).toBe('One.\n\n* * *\n\nTwo\\\nthree.\n');
  });

  it('brings footnotes and links, and leaves the font table and pictures out', () => {
    const rtf = '{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}{\\*\\generator Scrivener;}Salt{\\super \\chftn}{\\footnote \\pard\\plain \\chftn Kosher, coarse.} matters. {\\field{\\*\\fldinst{HYPERLINK "https://example.com"}}{\\fldrslt the site}}.{\\pict\\pngblip 89504e47}\\par}';
    expect(md(rtf)).toBe('Salt^[Kosher, coarse.] matters. [the site](https://example.com).\n');
    expect(md('{\\rtf1\\ansi Before{\\Scrv_annot \\color={0.6,0.6,0.6} \\text="a note to self" \\end_Scrv_annot} after.}')).toBe('Before after.\n');
  });

  it('brings headings and quotes back from their style names', () => {
    const rtf = '{\\rtf1\\ansi{\\stylesheet{\\s0 Normal;}{\\s1\\b Heading 1;}{\\s2 Block Quote;}}\\pard\\s1 Part One\\par\\pard\\s2 A quoted line.\\par\\pard\\s0 Plain.\\par}';
    expect(md(rtf)).toBe('# Part One\n\n> A quoted line.\n\nPlain.\n');
  });

  it('reads bytes as Latin-1 so escapes are left for the parser', () => {
    expect(decodeRtf(strToU8("{\\rtf1 a\\'92b}"))).toBe("{\\rtf1 a\\'92b}");
  });
});

describe('Scrivener labels and statuses', () => {
  it('picks the nearest Cookbook label colour', () => {
    expect(nearestLabel('0.8 0.25 0.2')).toBe('red');
    expect(nearestLabel('#3f7cc0')).toBe('blue');
    expect(nearestLabel('nonsense')).toBeNull();
  });
  it('reads status names', () => {
    expect(statusFrom('To Do')).toBeNull();
    expect(statusFrom('No Status')).toBeNull();
    expect(statusFrom('First Draft')).toBe('simmering');
    expect(statusFrom('Final Draft')).toBe('done');
  });
});

const SCRIVX = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Template="NO" Version="2.0" Creator="SCRMAC-3.2.3-16346">
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="CH1" Type="Folder">
          <Title>Chapter One</Title>
          <MetaData><LabelID>1</LabelID></MetaData>
          <Children>
            <BinderItem UUID="SC1" Type="Text">
              <Title>Sunday Dinner</Title>
              <MetaData><StatusID>2</StatusID><IncludeInCompile>Yes</IncludeInCompile></MetaData>
            </BinderItem>
            <BinderItem UUID="SC2" Type="Text">
              <Title>Sunday Dinner</Title>
              <MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>
            </BinderItem>
          </Children>
        </BinderItem>
        <BinderItem UUID="SC3" Type="Text">
          <Title>Interlude</Title>
          <Children>
            <BinderItem UUID="SC4" Type="Text"><Title>Later</Title></BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="RES" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="R1" Type="Text"><Title>Cornbread history</Title></BinderItem>
        <BinderItem UUID="R2" Type="PDF"><Title>Old menu</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="CHARS" Type="Folder">
      <Title>Characters</Title>
      <Children><BinderItem UUID="C1" Type="Text"><Title>June</Title></BinderItem></Children>
    </BinderItem>
    <BinderItem UUID="PLACES" Type="Folder">
      <Title>Places</Title>
      <Children><BinderItem UUID="P1" Type="Text"><Title>The Kitchen</Title></BinderItem></Children>
    </BinderItem>
    <BinderItem UUID="NOTES" Type="Folder">
      <Title>Notes</Title>
      <Children><BinderItem UUID="N1" Type="Text"><Title>Ideas</Title></BinderItem></Children>
    </BinderItem>
    <BinderItem UUID="TRASH" Type="TrashFolder">
      <Title>Trash</Title>
      <Children><BinderItem UUID="T1" Type="Text"><Title>Gone</Title></BinderItem></Children>
    </BinderItem>
  </Binder>
  <LabelSettings>
    <Labels>
      <Label ID="-1">No Label</Label>
      <Label ID="1" Color="0.247059 0.486275 0.752941">Main plot</Label>
    </Labels>
  </LabelSettings>
  <StatusSettings>
    <StatusItems>
      <Status ID="-1">No Status</Status>
      <Status ID="2">First Draft</Status>
    </StatusItems>
  </StatusSettings>
</ScrivenerProject>`;

function project(prefix = 'Summer Kitchen.scriv/'): Map<string, () => Promise<Uint8Array>> {
  const files: Record<string, string> = {
    'Summer Kitchen.scrivx': SCRIVX,
    'Files/Data/SC1/content.rtf': cocoa('The kitchen smelled of {\\b cornbread}.'),
    'Files/Data/SC1/synopsis.txt': 'June comes home.\n',
    'Files/Data/SC2/content.rtf': cocoa('A second take.'),
    'Files/Data/SC3/content.rtf': cocoa('Between the chapters.'),
    'Files/Data/SC4/content.rtf': cocoa('After.'),
    'Files/Data/R1/content.rtf': cocoa('Corn came first.'),
    'Files/Data/C1/content.rtf': cocoa('Twenty-six, a cook.'),
    'Files/Data/P1/content.rtf': cocoa('Yellow walls.'),
    'Files/Data/N1/content.rtf': cocoa('More pie.'),
    'Files/Data/T1/content.rtf': cocoa('Cut.'),
  };
  return new Map(Object.entries(files).map(([name, body]) => [prefix + name, async () => strToU8(body)]));
}

describe('importing a Scrivener project', () => {
  it('reads the Binder', () => {
    const p = parseScrivx(SCRIVX);
    expect(p.binder.map((b) => b.type)).toEqual(['DraftFolder', 'ResearchFolder', 'Folder', 'Folder', 'Folder', 'TrashFolder']);
    const ch1 = p.binder[0]!.children[0]!;
    expect(ch1).toMatchObject({ title: 'Chapter One', label: 'blue', v3: true });
    expect(ch1.children[0]).toMatchObject({ status: 'simmering', included: true });
    expect(ch1.children[1]).toMatchObject({ status: null, included: false });
  });

  it('finds the project in the folder it sits in, or inside it', async () => {
    expect(await findProject(filesSource(project()))).toEqual({ folder: 'Summer Kitchen.scriv', scrivx: 'Summer Kitchen.scriv/Summer Kitchen.scrivx' });
    expect(await findProject(filesSource(project('')))).toEqual({ folder: '', scrivx: 'Summer Kitchen.scrivx' });
    await expect(findProject(filesSource(new Map([['notes.txt', async () => strToU8('hi')]])))).rejects.toThrow(/no Scrivener project/);
    const two = new Map([...project('A.scriv/'), ...project('B.scriv/')]);
    await expect(findProject(filesSource(two))).rejects.toThrow(/more than one/);
  });

  it('lays the Draft out on the Shelf and the rest in the Pantry, in Binder order', async () => {
    const fs = new MemoryAdapter();
    const result = await importScrivener(filesSource(project()), fs);
    expect(result.info.title).toBe('Summer Kitchen');
    expect((await openBook(fs)).title).toBe('Summer Kitchen');
    expect(result).toMatchObject({ items: 4, cards: 4, skipped: ['Old menu'], first: 'bookshelf/Chapter One/Sunday Dinner.md' });

    const order = await loadOrder(fs);
    const shelf = await readTree(fs, 'bookshelf', order);
    expect(shelf.map((n) => n.name)).toEqual(['Chapter One', 'Interlude']);
    expect(shelf[0]!.children!.map((n) => n.name)).toEqual(['Sunday Dinner.md', 'Sunday Dinner 2.md']);
    // A document with documents inside becomes a Group whose first Item holds its own text.
    expect(shelf[1]!.children!.map((n) => n.name)).toEqual(['Interlude.md', 'Later.md']);

    const dinner = await readDocument(fs, 'bookshelf/Chapter One/Sunday Dinner.md');
    expect(dinner).toMatchObject({ title: 'Sunday Dinner', kind: 'scene', fields: { status: 'simmering', synopsis: 'June comes home.' } });
    expect(dinner.body).toBe('The kitchen smelled of **cornbread**.\n');
    expect((await readDocument(fs, 'bookshelf/Chapter One/Sunday Dinner 2.md')).fields).toEqual({ export: false });

    expect(await readDocument(fs, 'pantry/characters/June.md')).toMatchObject({ kind: 'character', body: 'Twenty-six, a cook.\n' });
    expect(await readDocument(fs, 'pantry/settings/The Kitchen.md')).toMatchObject({ kind: 'setting' });
    expect(await readDocument(fs, 'pantry/research/Cornbread history.md')).toMatchObject({ kind: 'research' });
    expect(await readDocument(fs, 'pantry/research/Notes/Ideas.md')).toMatchObject({ kind: 'research', body: 'More pie.\n' });
    // The Trash stays behind.
    expect(await fs.exists('bookshelf/Gone.md')).toBe(false);
    expect(await fs.exists('pantry/research/Trash')).toBe(false);
  });

  it('reads Scrivener 2 projects, which number their files', async () => {
    const xml = `<?xml version="1.0"?><ScrivenerProject><Binder>
      <BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title><Children>
        <BinderItem ID="7" Type="Text"><Title>Opening</Title></BinderItem>
      </Children></BinderItem></Binder></ScrivenerProject>`;
    const files = new Map([
      ['Old.scriv/Old.scrivx', async () => strToU8(xml)],
      ['Old.scriv/Files/Docs/7.rtf', async () => strToU8('{\\rtf1\\ansi It began.\\par}')],
      ['Old.scriv/Files/Docs/7_synopsis.txt', async () => strToU8('The start')],
    ]);
    const fs = new MemoryAdapter();
    await importScrivener(filesSource(files), fs);
    expect(await readDocument(fs, 'bookshelf/Opening.md')).toMatchObject({ body: 'It began.\n', fields: { synopsis: 'The start' } });
  });

  it('opens a zipped project, such as a Scrivener backup', async () => {
    const entries: Record<string, Uint8Array> = {};
    for (const [name, read] of project()) entries[name] = await read();
    const zip = zipSync(entries);
    expect(isScrivenerZip(zip)).toBe(true);
    expect(isScrivenerZip(zipSync({ 'a.txt': strToU8('x') }))).toBe(false);
    const fs = new MemoryAdapter();
    const result = await importScrivener(zipSource(zip)!, fs);
    expect(result.items).toBe(4);
  });
});
