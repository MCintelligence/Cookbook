// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { cookbookExtensions } from '../editor/extensions';
import { parseMarkdown } from '../editor/markdown';
import { nameMatcher } from '../editor/names';
import { fileNameFor } from '../storage/book';
import { type IssueKind } from './check';
import { type FoundIssue } from './plugin';
import { drunkReport, pepperReport, reportMarkdown, reportName, saltReport, spiceReport } from './reports';

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

const open = (md: string): PMNode => {
  editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown(md) });
  return editor.state.doc;
};

/** The nth place a piece of text appears, in document positions. */
function find(doc: PMNode, text: string, nth = 0): { from: number; to: number } {
  const found: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (let at = node.text!.indexOf(text); at !== -1; at = node.text!.indexOf(text, at + 1)) found.push({ from: pos + at, to: pos + at + text.length });
    return false;
  });
  return found[nth]!;
}

function issueAt(doc: PMNode, word: string, kind: IssueKind, rule: string, message = '', suggestions: string[] = [], nth = 0): FoundIssue {
  const { from, to } = find(doc, word, nth);
  return { from, to, word, issue: { from: 0, to: word.length, kind, rule, message, suggestions }, key: word, once: word, group: rule };
}

const SCENE = [
  '“You’re late,” Mara snapped. “The tide was against us,” said the boy. “Nobody told me,” Mara whispered softly.',
  'Ruth set the basket down. The wind had picked up and the awnings snapped above the stalls like sails. The harbour was grey and the harbour wall was grey and the gulls over the harbour were grey.',
  'She walked to the end of the pier where the boats came in every evening with the catch and the nets and the men who had been out on the water since before the sun came up over the hills.',
].join('\n\n');

describe('Seasonings reports', () => {
  it('names a saved report briefly, with no character a file name can’t hold', () => {
    const name = reportName('sam', new Date(2026, 9, 31, 15, 11));
    expect(name).toBe('Salty Sam · 31 Oct ’26 · 15.11');
    expect(fileNameFor(name)).toBe(name);
    expect(reportName('daniel', new Date(2027, 0, 5, 9, 4))).toBe('Drunk Daniel · 5 Jan ’27 · 09.04');
  });

  it('Sam groups the same slip and finds name near-misses', () => {
    const doc = open('Teh boat came in. Teh gulls followed. Mraa waved from the pier, and a crab scutled away.');
    const report = saltReport({
      doc,
      issues: [issueAt(doc, 'Teh', 'spelling', 'spelling'), issueAt(doc, 'Teh', 'spelling', 'spelling', '', [], 1), issueAt(doc, 'Mraa', 'spelling', 'name', '', ['Mara']), issueAt(doc, 'scutled', 'spelling', 'spelling')],
    });
    const repeats = report.sections.find((s) => s.title === 'Repeat offenders')!;
    expect(repeats.kind === 'rows' && repeats.rows.map((r) => [r.label, r.count])).toEqual([['Teh', 2]]);
    expect(report.stats.find((s) => s.label === 'Name slips')!.value).toBe('1');
    expect(report.actions[0]).toMatch(/“Teh” first/);
    expect(report.actions[1]).toMatch(/you mean Mara/);
  });

  it('Pete sorts slips by kind, in his own words', () => {
    const doc = open('They was late. The dogs runs fast. Its a shame.');
    const report = pepperReport({
      doc,
      issues: [
        issueAt(doc, 'was', 'grammar', 'agreement', 'With “they”, it’s “were”.'),
        issueAt(doc, 'runs', 'grammar', 'agreement', 'With “dogs”, it’s “run”.'),
        issueAt(doc, 'Its', 'grammar', 'ItsContraction'),
      ],
    });
    const kinds = report.sections[0]!;
    expect(kinds.kind === 'bars' && kinds.bars).toEqual([
      { label: 'Agreement', value: 2 },
      { label: 'Mix-up', value: 1 },
    ]);
    expect(report.actions[0]).toMatch(/agreement slips/);
    expect(report.stats.find((s) => s.label === 'Clean paragraphs')!.value).toBe('0%');
  });

  it('Daniel counts the talk, the tags and who is talking', () => {
    const doc = open(SCENE);
    const names = nameMatcher([{ id: 'm', path: 'pantry/characters/Mara.md', title: 'Mara', kind: 'character', aka: [] }]);
    const report = drunkReport({ doc, issues: [], names });
    const strip = report.sections.find((s) => s.kind === 'strip')!;
    expect(strip.kind === 'strip' && strip.cells.length).toBe(3);
    expect(strip.kind === 'strip' && strip.cells[1]!.share).toBe(0);
    expect(report.stats.find((s) => s.label === 'Dialogue tags')!.value).toBe('3');
    expect(report.stats.find((s) => s.label === 'Fancy tags')!.value).toBe('2');
    const who = report.sections.find((s) => s.title === 'Who talks')!;
    expect(who.kind === 'bars' && who.bars).toEqual([{ label: 'Mara', value: 2 }]);
    const adverbs = report.sections.find((s) => s.title === 'Adverbs on tags')!;
    expect(adverbs.kind === 'rows' && adverbs.rows.map((r) => r.label)).toEqual(['whispered softly']);
    const longest = report.sections.find((s) => s.title === 'Longest stretches')!;
    expect(longest.kind === 'rows' && longest.rows[0]!.detail).toMatch(/^77 words with no dialogue/);
  });

  it('Sally weighs the sentences and the words leaned on', () => {
    const doc = open(SCENE);
    const report = spiceReport({ doc, issues: [], names: null });
    const lengths = report.sections.find((s) => s.title === 'Sentence lengths')!;
    const total = lengths.kind === 'bars' ? lengths.bars.reduce((n, b) => n + b.value, 0) : 0;
    expect(String(total)).toBe(report.stats.find((s) => s.label === 'Sentences')!.value);
    const long = report.sections.find((s) => s.title === 'Longest sentences')!;
    expect(long.kind === 'rows' && long.rows[0]!.detail).toBe('40 words');
    const leaned = report.sections.find((s) => s.title === 'Words you lean on')!;
    expect(leaned.kind === 'rows' && leaned.rows.slice(0, 2).map((r) => [r.label, r.count])).toEqual([
      ['harbour', 3],
      ['grey', 3],
    ]);
    expect(report.actions[0]).toMatch(/^Chop the sentence starting “She walked/);
  });

  it('jumps land on the words they name', () => {
    const doc = open(SCENE);
    const report = drunkReport({ doc, issues: [], names: null });
    const adverbs = report.sections.find((s) => s.title === 'Adverbs on tags')!;
    const spot = adverbs.kind === 'rows' ? adverbs.rows[0]!.spots[0]! : null;
    expect(spot && doc.textBetween(spot.from, spot.to)).toBe('whispered softly');
  });

  it('saves as Markdown that reads back as a page', () => {
    const doc = open(SCENE);
    const when = new Date(2026, 9, 31, 15, 11);
    for (const report of [saltReport({ doc, issues: [] }), drunkReport({ doc, issues: [] }), spiceReport({ doc, issues: [] })]) {
      const md = reportMarkdown(report, 'Item 1', when);
      expect(md).toMatch(/## Try this first/);
      expect(md).toContain('On “Item 1”');
      const back = parseMarkdown(md);
      expect(JSON.stringify(back)).toContain('Try this first');
    }
    expect(reportMarkdown(drunkReport({ doc, issues: [] }), 'Item 1', when)).toMatch(/`[ ▁▂▃▄▅▆▇█]{3}`/);
  });
});
