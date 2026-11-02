import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { MemoryAdapter } from './memory';
import { openBook, readDocument, readTree } from './book';
import { loadOrder } from './order';
import { decodeRtf, rtfToContent, rtfToPage } from './rtf';
import { filesSource, findProject, importScrivener, isScrivenerZip, nearestLabel, parseComments, parseScrivx, snapshotDate, statusFrom, zipSource } from './scrivener';
import { listSnapshots } from './snapshots';
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
  });

  it('brings headings and quotes back from their style names', () => {
    const rtf = '{\\rtf1\\ansi{\\stylesheet{\\s0 Normal;}{\\s1\\b Heading 1;}{\\s2 Block Quote;}}\\pard\\s1 Part One\\par\\pard\\s2 A quoted line.\\par\\pard\\s0 Plain.\\par}';
    expect(md(rtf)).toBe('# Part One\n\n> A quoted line.\n\nPlain.\n');
  });

  it('reads bytes as Latin-1 so escapes are left for the parser', () => {
    expect(decodeRtf(strToU8("{\\rtf1 a\\'92b}"))).toBe("{\\rtf1 a\\'92b}");
  });
});

/** A page and its notes, with the notes' ids numbered in order so they can be compared. */
function page(rtf: string, linked = new Map<string, { text: string; footnote: boolean }>()) {
  const { content, notes } = rtfToPage(rtf, linked);
  let body = serializeMarkdown({ type: 'doc', content });
  const said: string[] = [];
  Object.entries(notes).forEach(([id, text]) => {
    body = body.split(id).join(`n${said.length + 1}`);
    said.push(text);
  });
  return { body, said };
}

describe('Scrivener notes in the text', () => {
  it('makes an inline annotation a note to self on the word before it', () => {
    expect(page('{\\rtf1\\ansi Before{\\Scrv_annot \\color={0.6,0.6,0.6} \\text="a note to self" \\end_Scrv_annot} after.}')).toEqual({
      body: '[Before]{.note #n1} after.\n',
      said: ['a note to self'],
    });
    // As older Scrivener wrote it, in capitals and with the colour as a group.
    expect(page('{\\rtf1\\ansi Salt it {\\SCRV_ANNOT \\COLOR={\\R=1.0\\G=0.0\\B=0.0} \\TEXT=Too much?\\END_SCRV_ANNOT}well.}').said).toEqual(['Too much?']);
  });

  it('puts an annotation at the start of a paragraph on the word after it, and one with no words at all becomes the page', () => {
    expect(page('{\\rtf1\\ansi {\\Scrv_annot \\text=Check this\\end_Scrv_annot}June arrived.\\par}').body).toBe('[June]{.note #n1} arrived.\n');
    expect(page('{\\rtf1\\ansi First.\\par{\\Scrv_annot \\text=Last word\\end_Scrv_annot}\\par}').body).toBe('[First.]{.note #n1}\n');
    expect(page('{\\rtf1\\ansi {\\Scrv_annot \\text=Only a thought\\end_Scrv_annot}}')).toEqual({ body: 'Only a thought\n', said: [] });
  });

  it('makes an inline footnote a footnote', () => {
    expect(page('{\\rtf1\\ansi Salt{\\Scrv_fn=Kosher, coarse.\\end_Scrv_fn} matters.}').body).toBe('Salt^[Kosher, coarse.] matters.\n');
  });

  it('anchors linked comments on the words they cover, and puts linked footnotes after them', () => {
    const linked = parseComments(`<?xml version="1.0" encoding="UTF-8"?><Comments>
      <Comment ID="C-1" Footnote="No" Author="Lou" Color="1 0.8 0.4"><![CDATA[{\\rtf1\\ansi Is this {\\i right}?\\par Ask Mum.}]]></Comment>
      <Comment ID="F-1" Footnote="Yes"><![CDATA[{\\rtf1\\ansi From 1890.}]]></Comment>
    </Comments>`);
    const rtf = '{\\rtf1\\ansi The {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://C-1"}}{\\fldrslt cornbread recipe}} came from {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://F-1"}}{\\fldrslt Gran}}. {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://GONE"}}{\\fldrslt Lost}} one.}';
    expect(page(rtf, linked)).toEqual({ body: 'The [cornbread recipe]{.note #n1} came from Gran^[From 1890.]. Lost one.\n', said: ['Is this right?\nAsk Mum.'] });
  });

  it('reads RTF comments as Word and Scrivener 2 write them', () => {
    const rtf = '{\\rtf1\\ansi The pie{\\*\\atnid LM}{\\*\\atnauthor Lou}\\chatn{\\*\\annotation{\\*\\atnref 1}{\\*\\atndate 12345}\\pard Less sugar.} cooled.}';
    expect(page(rtf)).toEqual({ body: 'The [pie]{.note #n1} cooled.\n', said: ['Less sugar.'] });
  });

  it('keeps tracked changes as suggestions', () => {
    expect(md('{\\rtf1\\ansi A {\\revised new} and {\\deleted old} word.}')).toBe('A [new]{.ins} and [old]{.del} word.\n');
  });

  it('never stops on damaged RTF', () => {
    for (const bad of ['', '{', '}}}{', '{\\rtf1 \\', '{\\rtf1 {\\Scrv_annot \\text=open', '\u0000\u0001binaryÿ', '{\\rtf1\\bin99 ab']) expect(() => rtfToPage(bad)).not.toThrow();
    expect(parseComments('<Comments><Comment ID="x">')).toEqual(new Map());
  });

  it('reads snapshot dates', () => {
    expect(snapshotDate('2018-01-01-10-00-00-0000.rtf')?.toISOString()).toBe('2018-01-01T10:00:00.000Z');
    expect(snapshotDate('2026-06-15-091400.rtf')?.toISOString()).toBe('2026-06-15T09:14:00.000Z');
    expect(snapshotDate('2024-03-02 08:30:00 +0100')?.toISOString()).toBe('2024-03-02T07:30:00.000Z');
    expect(snapshotDate('Untitled.rtf')).toBeNull();
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

describe('importing notes, comments, files and snapshots', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder"><Title>Draft</Title><Children>
      <BinderItem UUID="CH" Type="Folder"><Title>Part One</Title><Children>
        <BinderItem UUID="S1" Type="Text"><Title>Arrival</Title></BinderItem>
        <BinderItem UUID="S2" Type="Text"><Title>Empty scene</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="PIC0" Type="Image"><Title>Map in the draft</Title><MetaData><FileExtension>png</FileExtension></MetaData></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="RES" Type="ResearchFolder"><Title>Research</Title><Children>
      <BinderItem UUID="PDF1" Type="PDF"><Title>Old menu</Title><MetaData><FileExtension>pdf</FileExtension></MetaData></BinderItem>
      <BinderItem UUID="IMG1" Type="Image"><Title>Farmhouse</Title></BinderItem>
      <BinderItem UUID="WEB1" Type="WebArchive"><Title>Cornbread article</Title></BinderItem>
      <BinderItem UUID="WEB2" Type="WebArchive"><Title>Saved page</Title><MetaData><FileExtension>html</FileExtension></MetaData></BinderItem>
      <BinderItem UUID="GONE" Type="PDF"><Title>Missing scan</Title><MetaData><FileExtension>pdf</FileExtension></MetaData></BinderItem>
    </Children></BinderItem>
    <BinderItem UUID="CHARS" Type="Folder"><Title>Characters</Title><Children>
      <BinderItem UUID="J" Type="Text"><Title>June</Title></BinderItem>
      <BinderItem UUID="JP" Type="Image"><Title>June's photo</Title><MetaData><FileExtension>jpg</FileExtension></MetaData></BinderItem>
    </Children></BinderItem>
  </Binder>
</ScrivenerProject>`;
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const files = (): Map<string, () => Promise<Uint8Array>> => {
    const f: Record<string, string | Uint8Array> = {
      'Farm.scriv/Farm.scrivx': xml,
      'Farm.scriv/Files/Data/S1/content.rtf': cocoa('The {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://K1"}}{\\fldrslt bus}} was late.'),
      'Farm.scriv/Files/Data/S1/content.comments': '<?xml version="1.0"?><Comments><Comment ID="K1" Footnote="No"><![CDATA[{\\rtf1\\ansi Train instead?}]]></Comment></Comments>',
      'Farm.scriv/Files/Data/S1/notes.rtf': cocoa('Set in June.\\\nRain all day.'),
      'Farm.scriv/Files/Data/S1/snapshots/2024-05-01-12-00-00-0000.rtf': cocoa('The bus was early.'),
      'Farm.scriv/Files/Data/S1/snapshots/index.xml': '<SnapshotIndexes><Snapshot Date="2024-05-01 12:00:00 +0000"><Title>First go</Title><File>2024-05-01-12-00-00-0000.rtf</File></Snapshot></SnapshotIndexes>',
      'Farm.scriv/Snapshots/S1.snapshots/undated.rtf': cocoa('The bus never came.'),
      'Farm.scriv/Snapshots/Data/S1/2023-01-02-03-04-05 Before the rewrite.rtf': cocoa('No bus.'),
      'Farm.scriv/Files/Data/S2/notes.rtf': cocoa('Write the storm here.'),
      'Farm.scriv/Files/Data/CH/notes.rtf': cocoa('Part one is summer.'),
      'Farm.scriv/Files/Data/PIC0/content.png': PNG,
      'Farm.scriv/Files/Data/PDF1/content.pdf': '%PDF-1.4 menu',
      'Farm.scriv/Files/Data/PDF1/synopsis.txt': 'Prices in 1952',
      'Farm.scriv/Files/Data/PDF1/notes.rtf': cocoa('Check the year.'),
      'Farm.scriv/Files/Data/IMG1/content.jpeg': PNG,
      'Farm.scriv/Files/Data/WEB1/content.webarchive': 'bplist00\u0000WebResourceURL_\u0010https://example.com/cornbread\u0000',
      'Farm.scriv/Files/Data/WEB2/content.html': '<html><head><style>p{}</style></head><body><h1>Corn</h1><p>Grind it  fine.</p><script>x()</script></body></html>',
      'Farm.scriv/Files/Data/GONE/notes.rtf': cocoa('Ask the library.'),
      'Farm.scriv/Files/Data/J/notes.rtf': cocoa('Hates thunder.'),
      'Farm.scriv/Files/Data/JP/content.jpg': PNG,
    };
    return new Map(Object.entries(f).map(([name, body]) => [name, async () => (typeof body === 'string' ? strToU8(body) : body)]));
  };

  it('brings comments as notes to self, document notes as Materials, and snapshots with their Items', async () => {
    const fs = new MemoryAdapter();
    const result = await importScrivener(filesSource(files()), fs);
    const arrival = await readDocument(fs, 'bookshelf/Part One/Arrival.md');
    const notes = arrival.fields.notes as Record<string, string>;
    expect(Object.values(notes)).toEqual(['Train instead?']);
    expect(arrival.body).toMatch(/^The \[bus\]\{\.note #[\w-]+\} was late\.\n$/);

    const snaps = await listSnapshots(fs, arrival.id);
    expect(snaps.map((s) => [s.reason, s.body])).toEqual([
      ['From Scrivener', 'The bus never came.\n'],
      ['From Scrivener: First go', 'The bus was early.\n'],
      ['From Scrivener: Before the rewrite', 'No bus.\n'],
    ]);
    expect(snaps[1]!.date.toISOString()).toBe('2024-05-01T12:00:00.000Z');
    expect(snaps[2]!.date.toISOString()).toBe('2023-01-02T03:04:05.000Z');

    // Notes with no page to sit on are kept together in Materials.
    const kept = await readTree(fs, 'pantry/research/Notes from Scrivener', await loadOrder(fs));
    expect(kept.map((n) => n.name)).toEqual(['Part One.md', 'Arrival.md', 'Empty scene.md']);
    expect((await readDocument(fs, 'pantry/research/Notes from Scrivener/Arrival.md')).body).toBe('Set in June.\n\nRain all day.\n');
    expect((await readDocument(fs, 'pantry/research/Notes from Scrivener/Part One.md')).body).toBe('Part one is summer.\n');
    // A card with no words takes its notes as its page.
    expect((await readDocument(fs, 'pantry/characters/June.md')).body).toBe('Hates thunder.\n');
    expect(result).toMatchObject({ notes: 1, snapshots: 3, files: 6, skipped: ['Missing scan'] });
  });

  it('keeps pictures in pictures/ and other files in files/, each on a card', async () => {
    const fs = new MemoryAdapter();
    await importScrivener(filesSource(files()), fs);
    const menu = await readDocument(fs, 'pantry/research/Old menu.md');
    expect(menu).toMatchObject({ kind: 'research', fields: { synopsis: 'Prices in 1952' } });
    // A card's document notes follow its own words.
    expect(menu.body).toBe('*A PDF brought from Scrivener, kept with this recipe as* `files/Old menu.pdf`*.*\n\n### Notes\n\nCheck the year.\n');
    expect(strFromU8(await fs.readBytes('files/Old menu.pdf'))).toBe('%PDF-1.4 menu');

    // A picture with no FileExtension is still found, and shown on its card.
    expect((await readDocument(fs, 'pantry/research/Farmhouse.md')).body).toBe('![Farmhouse](pictures/Farmhouse.jpeg)\n');
    expect(await fs.readBytes('pictures/Farmhouse.jpeg')).toEqual(PNG);
    // In Characters it becomes the card's portrait.
    expect((await readDocument(fs, "pantry/characters/June's photo.md")).fields).toEqual({ portrait: "pictures/June's photo.jpg" });
    // A picture in the Draft goes to Materials, not the Shelf.
    expect(await fs.exists('pantry/research/Map in the draft.md')).toBe(true);
    expect((await readTree(fs, 'bookshelf')).map((n) => n.name)).toEqual(['Part One']);

    expect((await readDocument(fs, 'pantry/research/Cornbread article.md')).body).toContain('Saved from [https://example.com/cornbread](https://example.com/cornbread)');
    expect((await readDocument(fs, 'pantry/research/Saved page.md')).body).toContain('Corn\n\nGrind it fine.\n');
    // A file that isn't in the project keeps its card for its notes, and is named in the message.
    expect((await readDocument(fs, 'pantry/research/Missing scan.md')).body).toBe('Ask the library.\n');
  });

  it('finds Scrivener 2 pictures and notes beside the text in Files/Docs', async () => {
    const v2 = `<?xml version="1.0"?><ScrivenerProject><Binder>
      <BinderItem ID="0" Type="DraftFolder"><Title>Draft</Title><Children><BinderItem ID="3" Type="Text"><Title>One</Title></BinderItem></Children></BinderItem>
      <BinderItem ID="1" Type="ResearchFolder"><Title>Research</Title><Children><BinderItem ID="9" Type="Image"><Title>Barn</Title></BinderItem></Children></BinderItem>
    </Binder></ScrivenerProject>`;
    const f = new Map<string, () => Promise<Uint8Array>>([
      ['Old.scriv/Old.scrivx', async () => strToU8(v2)],
      ['Old.scriv/Files/Docs/3.rtf', async () => strToU8('{\\rtf1\\ansi Hello there.}')],
      ['Old.scriv/Files/Docs/3_notes.rtf', async () => strToU8('{\\rtf1\\ansi Say it louder.}')],
      ['Old.scriv/Files/Docs/9.png', async () => PNG],
      ['Old.scriv/Snapshots/3.snapshots/2010-02-03-04-05-06-0000.rtf', async () => strToU8('{\\rtf1\\ansi Hi.}')],
    ]);
    const fs = new MemoryAdapter();
    const result = await importScrivener(filesSource(f), fs);
    const one = await readDocument(fs, 'bookshelf/One.md');
    expect((await readDocument(fs, 'pantry/research/Notes from Scrivener/One.md')).body).toBe('Say it louder.\n');
    expect((await readDocument(fs, 'pantry/research/Barn.md')).body).toBe('![Barn](pictures/Barn.png)\n');
    expect((await listSnapshots(fs, one.id))[0]).toMatchObject({ body: 'Hi.\n', reason: 'From Scrivener' });
    expect(result).toMatchObject({ files: 1, snapshots: 1, skipped: [] });
  });

  it('carries on past files that fail to read', async () => {
    const f = files();
    f.set('Farm.scriv/Files/Data/S1/content.comments', async () => strToU8('<Comments><oops'));
    f.set('Farm.scriv/Files/Data/PDF1/content.pdf', async () => {
      throw new Error('disk error');
    });
    const fs = new MemoryAdapter();
    const result = await importScrivener(filesSource(f), fs);
    expect((await readDocument(fs, 'bookshelf/Part One/Arrival.md')).body).toBe('The bus was late.\n');
    expect(result.skipped).toEqual(['Old menu', 'Missing scan']);
  });
});
