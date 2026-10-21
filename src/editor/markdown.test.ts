import { describe, expect, it } from 'vitest';
import { type NodeJSON, markKey, parseInline, parseMarkdown, serializeMarkdown } from './markdown';

const t = (text: string, ...styles: string[]): NodeJSON =>
  styles.length ? { type: 'text', text, marks: styles.map((style) => ({ type: 'charStyle', attrs: { style } })) } : { type: 'text', text };
const p = (style: string, ...content: NodeJSON[]): NodeJSON => ({ type: 'paragraph', attrs: { style }, content });

describe('inline markup', () => {
  it('reads strong, emphasis and named character styles', () => {
    expect(parseInline('a **b** *c* [d]{.thought} [e]{.underline}')).toEqual([
      t('a '),
      t('b', 'strong'),
      t(' '),
      t('c', 'emphasis'),
      t(' '),
      t('d', 'thought'),
      t(' '),
      t('e', 'underline'),
    ]);
  });

  it('nests styles', () => {
    expect(parseInline('***both*** and **bold *both* bold**')).toEqual([
      t('both', 'strong', 'emphasis'),
      t(' and '),
      t('bold ', 'strong'),
      t('both', 'strong', 'emphasis'),
      t(' bold', 'strong'),
    ]);
    expect(parseInline('[she *really* thought]{.thought}')).toEqual([
      t('she ', 'thought'),
      t('really', 'thought', 'emphasis'),
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
      'The kitchen smelled of **cornbread** and *black pepper*.',
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
    const doc = { type: 'doc', content: [p('body', t('a '), t('bold ', 'strong'), t('end'))] };
    const md = serializeMarkdown(doc);
    expect(md).toBe('a **bold** end\n');
    expect(parseMarkdown(md)).toEqual({ type: 'doc', content: [p('body', t('a '), t('bold', 'strong'), t(' end'))] });
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
  const words = ['Lou', 'greens', 'pie', '*', '[', ']', '\\', 'a', '“quoted”', 'x_y', '{.z}', 'it’s'];
  const styles = ['strong', 'emphasis', 'thought', 'underline'];

  it('survives 500 random paragraphs', () => {
    const rand = rng(42);
    for (let n = 0; n < 500; n++) {
      const count = 1 + Math.floor(rand() * 6);
      const pieces: NodeJSON[] = [];
      for (let i = 0; i < count; i++) {
        const word = words[Math.floor(rand() * words.length)]!;
        const marks = styles.filter(() => rand() < 0.3);
        if (i > 0) pieces.push(t(' '));
        pieces.push(t(word, ...marks));
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
    const doc = parseMarkdown('[a **pie**]{.note #n2}');
    expect(serializeMarkdown(doc)).toBe('[a **pie**]{.note #n2}\n');
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
