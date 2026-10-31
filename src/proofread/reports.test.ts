// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { cookbookExtensions } from '../editor/extensions';
import { parseMarkdown } from '../editor/markdown';
import { fileNameFor } from '../storage/book';
import { type IssueKind } from './check';
import { type FoundIssue } from './plugin';
import { reportMarkdown, reportName, saltReport } from './reports';

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

  it('saves as Markdown that reads back as a page', () => {
    const doc = open(SCENE);
    const when = new Date(2026, 9, 31, 15, 11);
    for (const report of [saltReport({ doc, issues: [] })]) {
      const md = reportMarkdown(report, 'Item 1', when);
      expect(md).toMatch(/## Try this first/);
      expect(md).toContain('On “Item 1”');
      const back = parseMarkdown(md);
      expect(JSON.stringify(back)).toContain('Try this first');
    }
  });
});
