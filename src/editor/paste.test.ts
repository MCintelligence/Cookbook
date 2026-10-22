// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { cookbookExtensions } from './extensions';
import { parseMarkdown, serializeMarkdown, type NodeJSON } from './markdown';
import { cleanPastedHtml } from './paste';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** Pastes HTML into an empty scene and returns the scene's Markdown. */
function paste(html: string): string {
  const editor = new Editor({ extensions: cookbookExtensions((s) => s), content: parseMarkdown('') });
  editors.push(editor);
  editor.commands.focus('end');
  // jsdom has no ClipboardEvent; ProseMirror only needs one to exist.
  editor.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
  return serializeMarkdown(editor.getJSON() as NodeJSON);
}

// Trimmed from what Word for Windows puts on the clipboard.
const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoListParagraph {}</style></head><body>
<p class=MsoTitle>Sunday Dinner</p>
<p class=MsoNormal>The kitchen smelled of <b>cornbread</b> and <i>pepper</i>, <u>loud</u> <s>quiet</s>.<o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>eggs</p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>o<span>&nbsp; </span></span><![endif]>brown ones</p>
<p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>·<span>&nbsp; </span></span><![endif]>flour</p>
<p class=MsoNormal>Steps:</p>
<p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp; </span></span><![endif]>Mix</p>
<p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp; </span></span><![endif]>Bake</p>
<p class=MsoQuote>Never rush a pie.</p>
<h2>Later</h2>
</body></html>`;

// Trimmed from what Google Docs puts on the clipboard.
const GOOGLE = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1234"><p dir="ltr"><span style="font-weight:400;">Plain then </span><span style="font-weight:700;">bold</span><span style="font-weight:400;"> then </span><span style="font-style:italic;font-weight:400;">italic</span><span style="font-weight:400;"> and </span><a href="https://example.com/pie"><span style="text-decoration:underline;">a link</span></a></p><h1 dir="ltr"><span>Part One</span></h1><ol><li dir="ltr"><p dir="ltr"><span>first</span></p></li><li dir="ltr"><p dir="ltr"><span>second</span></p></li></ol></b>`;

describe('pasting from other apps', () => {
  it('keeps Word formatting, lists (nested and numbered), title and quote', () => {
    expect(paste(WORD)).toBe(
      [
        '# Sunday Dinner',
        '',
        'The kitchen smelled of **cornbread** and *pepper*, [loud]{.ul} ~~quiet~~.',
        '',
        '- eggs',
        '  - brown ones',
        '- flour',
        '',
        'Steps:',
        '',
        '1. Mix',
        '2. Bake',
        '',
        '> Never rush a pie.',
        '',
        '## Later',
        '',
      ].join('\n'),
    );
  });

  it('keeps Google Docs bold, italic, links, headings and lists, ignoring its outer bold wrapper', () => {
    expect(paste(GOOGLE)).toBe('Plain then **bold** then *italic* and [[a link]{.ul}](https://example.com/pie)\n\n# Part One\n\n1. first\n2. second\n');
  });

  it('splits merged table cells back out', () => {
    const md = paste('<table><tr><th colspan="2">Dish</th><th>Who</th></tr><tr><td rowspan="2">Pie</td><td>apple</td><td>Lou</td></tr><tr><td>peach</td><td>June</td></tr></table>');
    expect(md).toBe('| Dish |  | Who |\n| --- | --- | --- |\n| Pie | apple | Lou |\n|  | peach | June |\n');
  });

  it('quotes block quotes from web pages, and drops links that are not web or mail addresses', () => {
    expect(paste('<blockquote>Loose words<p>A paragraph</p></blockquote><p><a href="javascript:alert(1)">click</a></p>')).toBe('> Loose words\n>\n> A paragraph\n\nclick\n');
  });

  it('leaves a paste from Cookbook itself alone', () => {
    const html = '<p data-pm-slice="1 1 []">x</p>';
    expect(cleanPastedHtml(html)).toBe(html);
  });
});
