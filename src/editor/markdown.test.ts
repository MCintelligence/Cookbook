import { describe, expect, it } from 'vitest';
import { type NodeJSON, markKey, parseInline, parseMarkdown, serializeMarkdown } from './markdown';

const PLAIN = ['bold', 'italic', 'ul', 'strike', 'code'];
// Plain formatting by name; anything else is a character style.
const t = (text: string, ...styles: string[]): NodeJSON =>
  styles.length
    ? { type: 'text', text, marks: styles.map((style) => (PLAIN.includes(style) ? { type: style === 'ul' ? 'underline' : style } : { type: 'charStyle', attrs: { style } })) as NodeJSON['marks'] }
    : { type: 'text', text };
const p = (style: string, ...content: NodeJSON[]): NodeJSON => ({ type: 'paragraph', attrs: { style }, content });

describe('inline markup', () => {
  it('reads plain bold and italic, and named character styles', () => {
    expect(parseInline('a **b** *c* [d]{.thought} [e]{.underline}')).toEqual([
      t('a '),
      t('b', 'bold'),
      t(' '),
      t('c', 'italic'),
      t(' '),
      t('d', 'thought'),
      t(' '),
      t('e', 'underline'),
    ]);
  });

  it('nests styles', () => {
    expect(parseInline('***both*** and **bold *both* bold**')).toEqual([
      t('both', 'bold', 'italic'),
      t(' and '),
      t('bold ', 'bold'),
      t('both', 'bold', 'italic'),
      t(' bold', 'bold'),
    ]);
    expect(parseInline('[she *really* thought]{.thought}')).toEqual([
      t('she ', 'thought'),
      t('really', 'thought', 'italic'),
      t(' thought', 'thought'),
    ]);
  });

  it('leaves stray symbols as text', () => {
    expect(parseInline('5 * 3 = 15, [sic], a*')).toEqual([t('5 * 3 = 15, [sic], a*')]);
    expect(parseInline('\\*not\\* \\[a\\]')).toEqual([t('*not* [a]')]);
  });
});

describe('blocks', () => {
  it('reads paragraphs, styled blocks, scene breaks and lists', () => {
    const md = [
      'The kitchen smelled of cornbread',
      'and black pepper.',
      '',
      '::: letter',
      'Dear June,',
      '',
      'More nutmeg.',
      ':::',
      '',
      '* * *',
      '',
      '- eggs',
      '- flour',
      '',
      '- [ ] find the hymn',
      '- [x] rename Delia’s sister',
      '',
    ].join('\n');
    expect(parseMarkdown(md)).toEqual({
      type: 'doc',
      content: [
        p('body', t('The kitchen smelled of cornbread and black pepper.')),
        p('letter', t('Dear June,')),
        p('letter', t('More nutmeg.')),
        { type: 'sceneBreak' },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [t('eggs')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [t('flour')] }] },
          ],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [t('find the hymn')] }] },
            { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [t('rename Delia’s sister')] }] },
          ],
        },
      ],
    });
  });

  it('gives an empty scene one empty paragraph', () => {
    expect(parseMarkdown('')).toEqual({ type: 'doc', content: [{ type: 'paragraph', attrs: { style: 'body' } }] });
  });

  it('writes the same file it reads', () => {
    const md = [
      'The kitchen smelled of **cornbread** and *black pepper* and [salt]{.strong}.',
      '',
      '::: letter',
      'Dear June,',
      '',
      'Don’t tell her I said so.',
      ':::',
      '',
      '* * *',
      '',
      '[She’ll never let me *read* it,]{.thought} she thought.',
      '',
      '- [ ] find the hymn',
      '- [x] done',
      '',
    ].join('\n');
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md);
  });

  it('escapes text that would otherwise look like markup', () => {
    const doc = {
      type: 'doc',
      content: [p('body', t('- not a list')), p('body', t('---')), p('body', t('::: not a fence')), p('body', t('a * b [c]{.x} \\'))],
    };
    const md = serializeMarkdown(doc);
    expect(parseMarkdown(md)).toEqual(doc);
  });

  it('moves spaces outside styles so the file stays valid', () => {
    const doc = { type: 'doc', content: [p('body', t('a '), t('bold ', 'bold'), t('end'))] };
    const md = serializeMarkdown(doc);
    expect(md).toBe('a **bold** end\n');
    expect(parseMarkdown(md)).toEqual({ type: 'doc', content: [p('body', t('a '), t('bold', 'bold'), t(' end'))] });
  });
});

describe('round trips', () => {
  // A small deterministic generator, so failures reproduce.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }
  const words = ['Lou', 'greens', 'pie', '*', '[', ']', '\\', 'a', '“quoted”', 'x_y', '{.z}', 'it’s', '_', '~~', '`', '#', '1.', '|', '!', '(x)', 'Wow!'];
  const styles = ['strong', 'emphasis', 'thought', 'bold', 'italic', 'ul', 'strike', 'code', '@https://example.com/a(b)'];
  const FORMATS = [{ font: 'EB Garamond', size: 14 }, { color: '#7a2e1f' }, { size: 10.5, color: '#000000' }];

  it('survives 500 random paragraphs', () => {
    const rand = rng(Number(process.env.SEED ?? 42));
    for (let n = 0; n < Number(process.env.N ?? 500); n++) {
      const count = 1 + Math.floor(rand() * 6);
      const pieces: NodeJSON[] = [];
      for (let i = 0; i < count; i++) {
        const word = words[Math.floor(rand() * words.length)]!;
        const marks = styles.filter(() => rand() < 0.25);
        if (i > 0) pieces.push(t(' '));
        const node = t(word, ...marks.filter((m) => !m.startsWith('@')));
        if (marks.some((m) => m.startsWith('@'))) node.marks = [...(node.marks ?? []), { type: 'link', attrs: { href: 'https://example.com/a(b)' } }];
        const format = FORMATS[Math.floor(rand() * FORMATS.length * 2)];
        if (format) node.marks = [...(node.marks ?? []), { type: 'textStyle', attrs: format }];
        pieces.push(node);
      }
      // Normalise the way the editor would: merge neighbours with identical styles.
      const doc = parseMarkdown(serializeMarkdown({ type: 'doc', content: [p('body', ...pieces)] }));
      const again = parseMarkdown(serializeMarkdown(doc));
      expect(again).toEqual(doc);
      const plain = (d: NodeJSON) => (d.content?.[0]?.content ?? []).map((x) => x.text).join('');
      expect(plain(doc)).toBe(pieces.map((x) => x.text).join(''));
      const styled = (d: NodeJSON) =>
        (d.content?.[0]?.content ?? []).flatMap((x) =>
          [...(x.text ?? '')].map((ch) => (/\s/.test(ch) ? '' : (x.marks ?? []).map(markKey).sort().join(','))),
        );
      const expected = pieces.flatMap((x) =>
        [...(x.text ?? '')].map((ch) => (/\s/.test(ch) ? '' : (x.marks ?? []).map(markKey).sort().join(','))),
      );
      expect(styled(doc)).toEqual(expected);
    }
  });
});

describe('notes and footnotes', () => {
  const note = (text: string, id: string): NodeJSON => ({ type: 'text', text, marks: [{ type: 'note', attrs: { id } }] });

  it('reads a note anchor', () => {
    expect(parseInline('See [the pie]{.note #n1} here')).toEqual([t('See '), note('the pie', 'n1'), t(' here')]);
  });

  it('keeps character styles inside a note', () => {
    const doc = parseMarkdown('[a **pie** [too]{.strong}]{.note #n2}');
    expect(serializeMarkdown(doc)).toBe('[a **pie** [too]{.strong}]{.note #n2}\n');
  });

  it('reads an inline footnote', () => {
    expect(parseInline('Cornbread.^[Lou’s recipe, 1962.] Then')).toEqual([
      t('Cornbread.'),
      { type: 'footnote', attrs: { text: 'Lou’s recipe, 1962.' } },
      t(' Then'),
    ]);
  });

  it('round-trips footnotes with brackets and stars in them', () => {
    const md = 'Pie^[a \\[note\\] with \\*stars\\*] and *more*.';
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md + '\n');
    expect(parseInline(md)[1]).toEqual({ type: 'footnote', attrs: { text: 'a [note] with *stars*' } });
  });

  it('leaves a lone caret alone', () => {
    expect(parseInline('2^3 is eight')).toEqual([t('2^3 is eight')]);
  });

  it('ignores ids on other classes', () => {
    expect(parseInline('[x]{.thought #n1}')).toEqual([t('[x]{.thought #n1}')]);
  });
});

describe('more Markdown', () => {
  const doc = (...content: NodeJSON[]) => ({ type: 'doc', content });
  const li = (text: string, ...nested: NodeJSON[]): NodeJSON => ({ type: 'listItem', content: [{ type: 'paragraph', content: [t(text)] }, ...nested] });

  it('reads headings and quotes as their paragraph styles', () => {
    expect(parseMarkdown('# One\n\n## Two ##\n\n#### Four\n\n> Said\n> she.\n>\n> Again.\n\nAfter')).toEqual(
      doc(p('chapter-title', t('One')), p('heading-2', t('Two')), p('heading-3', t('Four')), p('quote', t('Said she.')), p('quote', t('Again.')), p('body', t('After'))),
    );
    expect(serializeMarkdown(parseMarkdown('# One\n\n> Said\n>\n> Again.\n'))).toBe('# One\n\n> Said\n>\n> Again.\n');
  });

  it('still reads chapter titles written as fences', () => {
    expect(parseMarkdown('::: chapter-title\nOne\n:::\n')).toEqual(doc(p('chapter-title', t('One'))));
  });

  it('reads numbered lists, nested lists and continued lines', () => {
    const md = '3. three\n4. four\n   - inner\n     still inner\n     1. deeper\n5. five\n';
    expect(parseMarkdown(md)).toEqual(
      doc({
        type: 'orderedList',
        attrs: { start: 3 },
        content: [
          li('three'),
          li('four', { type: 'bulletList', content: [li('inner still inner', { type: 'orderedList', attrs: { start: 1 }, content: [li('deeper')] })] }),
          li('five'),
        ],
      }),
    );
    expect(serializeMarkdown(parseMarkdown(md))).toBe('3. three\n4. four\n   - inner still inner\n     1. deeper\n5. five\n');
  });

  it('keeps years at the start of a paragraph as text', () => {
    expect(parseMarkdown('1962. That summer.')).toEqual(doc(p('body', t('1962. That summer.'))));
    const written = serializeMarkdown(doc(p('body', t('1. not a list'))));
    expect(written).toBe('1\\. not a list\n');
    expect(parseMarkdown(written)).toEqual(doc(p('body', t('1. not a list'))));
  });

  it('reads and writes pipe tables', () => {
    const md = '| Dish | Who |\n| --- | :-: |\n| Pie | Lou \\| June |\n| Greens |\n';
    const parsed = parseMarkdown(md);
    const cell = (type: string, text: string): NodeJSON => ({ type, content: [{ type: 'paragraph', ...(text ? { content: [t(text)] } : {}) }] });
    expect(parsed).toEqual(
      doc({
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', 'Dish'), cell('tableHeader', 'Who')] },
          { type: 'tableRow', content: [cell('tableCell', 'Pie'), cell('tableCell', 'Lou | June')] },
          { type: 'tableRow', content: [cell('tableCell', 'Greens'), cell('tableCell', '')] },
        ],
      }),
    );
    expect(serializeMarkdown(parsed)).toBe('| Dish | Who |\n| --- | --- |\n| Pie | Lou \\| June |\n| Greens |  |\n');
  });

  it('reads code, strikethrough, underline, links and pictures', () => {
    expect(parseInline('`a *b*` ~~gone~~ [ul]{.ul} [site](https://x.org/a_(b)) ![Lou](<pantry/pictures/lou 1.jpg>)')).toEqual([
      t('a *b*', 'code'),
      t(' '),
      t('gone', 'strike'),
      t(' '),
      t('ul', 'ul'),
      t(' '),
      { type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://x.org/a_(b)' } }] },
      t(' '),
      { type: 'image', attrs: { src: 'pantry/pictures/lou 1.jpg', alt: 'Lou' } },
    ]);
    // Backticks inside code get a longer fence, padded when the code starts or ends with one.
    const md = 'Use `` a`b `` and ` `` ` and ~~x~~ [**bold link**](https://x.org) ![Lou](<pantry/pictures/lou 1.jpg>)\n';
    const written = serializeMarkdown(parseMarkdown(md));
    expect(written).toBe('Use ``a`b`` and ``` `` ``` and ~~x~~ [**bold link**](https://x.org) ![Lou](<pantry/pictures/lou 1.jpg>)\n');
    expect(parseMarkdown(written)).toEqual(parseMarkdown(md));
  });

  it('reads underscores as italic, but not inside words', () => {
    expect(parseInline('_soft_ and __loud__ in snake_case_name')).toEqual([t('soft', 'italic'), t(' and '), t('loud', 'bold'), t(' in snake_case_name')]);
  });

  it('breaks lines with a backslash or two spaces', () => {
    const parsed = parseMarkdown('Roses are red,\\\nviolets *blue,*  \nsugar.\n');
    expect(parsed).toEqual(doc(p('body', t('Roses are red,'), { type: 'hardBreak' }, t('violets '), t('blue,', 'italic'), { type: 'hardBreak' }, t('sugar.'))));
    expect(serializeMarkdown(parsed)).toBe('Roses are red,\\\nviolets *blue,*\\\nsugar.\n');
    // A line that starts like a list after the break stays text.
    const tricky = doc(p('body', t('a'), { type: 'hardBreak' }, t('- b')));
    expect(parseMarkdown(serializeMarkdown(tricky))).toEqual(tricky);
  });

  it('reads code blocks without looking inside them', () => {
    const md = '```js\nconst a = *b*;\n\n# not a heading\n```\n';
    expect(parseMarkdown(md)).toEqual(doc({ type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const a = *b*;\n\n# not a heading' }] }));
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md);
  });

  it('escapes text that would start a block', () => {
    const lines = ['# hash', '> quote', '| pipe', '+ plus', '```', '1) one', '~~~'];
    const d = doc(...lines.map((l) => p('body', t(l))));
    expect(parseMarkdown(serializeMarkdown(d))).toEqual(d);
  });
});

describe('direct formatting', () => {
  const fmt = (text: string, attrs: Record<string, unknown>): NodeJSON => ({ type: 'text', text, marks: [{ type: 'textStyle', attrs }] as NodeJSON['marks'] });

  it('writes fonts, sizes and colours set by hand as Pandoc attributes', () => {
    const doc = { type: 'doc', content: [p('body', t('Plain and '), fmt('big red', { font: 'EB Garamond', size: 18, color: '#AA0000' }), t(' words.'))] };
    const md = serializeMarkdown(doc);
    expect(md).toBe('Plain and [big red]{font="EB Garamond" size=18 color=#aa0000} words.\n');
    expect(parseMarkdown(md).content?.[0]?.content?.[1]).toEqual(fmt('big red', { font: 'EB Garamond', size: 18, color: '#aa0000' }));
  });

  it('keeps a character style around direct formatting', () => {
    const node: NodeJSON = { type: 'text', text: 'Hm', marks: [{ type: 'charStyle', attrs: { style: 'thought' } }, { type: 'textStyle', attrs: { size: 9 } }] };
    const md = serializeMarkdown({ type: 'doc', content: [p('body', node)] });
    expect(md).toBe('[[Hm]{size=9}]{.thought}\n');
    expect(parseMarkdown(md).content?.[0]?.content?.[0]).toEqual(node);
  });

  it('leaves brackets with other attributes as text', () => {
    expect(parseInline('[x]{size=big}')).toEqual([t('[x]{size=big}')]);
    expect(parseInline('[x]{weight=9}')).toEqual([t('[x]{weight=9}')]);
  });

  it('fences paragraphs with their own alignment or spacing, sharing a fence when they match', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { style: 'chapter-title', align: 'left' }, content: [t('One')] },
        { type: 'paragraph', attrs: { style: 'body', align: 'center', lineSpacing: 2 }, content: [t('Centred.')] },
        { type: 'paragraph', attrs: { style: 'body', align: 'center', lineSpacing: 2 }, content: [t('Also.')] },
        { type: 'paragraph', attrs: { style: 'letter', lineSpacing: 1 }, content: [t('Dear Lou,')] },
        { type: 'paragraph', attrs: { style: 'letter' }, content: [t('Yours.')] },
        { type: 'paragraph', attrs: { style: 'quote', align: 'right' }, content: [t('Said.')] },
        p('body', t('Plain.')),
      ],
    };
    const md = serializeMarkdown(doc);
    expect(md).toBe(
      '::: {.chapter-title align=left}\nOne\n:::\n\n::: {align=center spacing=2}\nCentred.\n\nAlso.\n:::\n\n::: {.letter spacing=1}\nDear Lou,\n:::\n\n::: letter\nYours.\n:::\n\n::: {.quote align=right}\nSaid.\n:::\n\nPlain.\n',
    );
    expect(parseMarkdown(md)).toEqual(doc);
  });

  it('still reads fences without formatting', () => {
    expect(parseMarkdown('::: {.letter}\nDear Lou,\n:::\n')).toEqual({ type: 'doc', content: [p('letter', t('Dear Lou,'))] });
  });
});
