// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotesMarkdown, parseNotes } from './notesMarkdown';

const html = (md: string) => renderToStaticMarkup(<NotesMarkdown source={md} />);

describe('release notes Markdown', () => {
  it('drops the leading title and keeps headings, lists and rules', () => {
    const blocks = parseNotes('# Cookbook 0.4.1\n\n\n## New\n\n### Set the Table\n\nA few *quick* questions.\nRun it again.\n\n- one\n- two\n\n---\n\n## Bug fixes\n\n1. first\n2. second');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading', 'para', 'list', 'rule', 'heading', 'list']);
    expect(blocks[2]).toEqual({ kind: 'para', text: 'A few *quick* questions. Run it again.' });
    expect(blocks[6]).toEqual({ kind: 'list', ordered: true, items: ['first', 'second'] });
  });

  it('draws bold, italics, code and safe links', () => {
    expect(html('Press **F1** or *Help › Manual*, `code`, __big__ and _soft_.')).toBe(
      '<p>Press <strong>F1</strong> or <em>Help › Manual</em>, <code>code</code>, <strong>big</strong> and <em>soft</em>.</p>',
    );
    expect(html('**Bold with *italic* inside**')).toBe('<p><strong>Bold with <em>italic</em> inside</strong></p>');
    // A javascript: link is shown as plain text, never as a link.
    expect(html('[site](https://example.com) and [bad](javascript:void)')).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a> and bad</p>',
    );
  });

  it('leaves snake_case and raw HTML alone', () => {
    expect(html('use snake_case_names')).toBe('<p>use snake_case_names</p>');
    expect(html('<img src=x onerror=alert(1)>')).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('turns headings into h3 and below', () => {
    expect(html('## Additions\n\n### Manual')).toBe('<h3>Additions</h3><h4>Manual</h4>');
  });
});

describe('update popup', () => {
  it('stays away from a version the writer put off, for a day', async () => {
    const { putOff, rememberLater, LATER_FOR_MS } = await import('./updateSchedule');
    rememberLater('0.4.2', 1_000);
    expect(putOff('0.4.2', 2_000)).toBe(true);
    expect(putOff('0.4.3', 2_000)).toBe(false);
    expect(putOff(null, 2_000)).toBe(false);
    expect(putOff('0.4.2', 1_000 + LATER_FOR_MS)).toBe(false);
  });

  it('forgets an old-style "Later" so the popup asks again', async () => {
    const { putOff } = await import('./updateSchedule');
    localStorage.setItem('cookbook.updateLater', '0.4.2');
    expect(putOff('0.4.2')).toBe(false);
  });

  it('checks only when the last good check is old and the last try was a while ago', async () => {
    const { checkDue, CHECK_EVERY_MS, RETRY_AFTER_MS } = await import('./updateSchedule');
    const now = new Date(2026, 10, 11, 20, 0).getTime();
    expect(checkDue(now, 0, 0)).toBe(true);
    expect(checkDue(now, now - CHECK_EVERY_MS + 1, 0)).toBe(false);
    expect(checkDue(now, 0, now - RETRY_AFTER_MS + 1)).toBe(false);
    expect(checkDue(now, now - CHECK_EVERY_MS, now - RETRY_AFTER_MS)).toBe(true);
  });

  it('checks again on a new day, as the daily target resets', async () => {
    const { checkDue, untilMidnight } = await import('./updateSchedule');
    const late = new Date(2026, 10, 11, 23, 30).getTime();
    const after = late + untilMidnight(late);
    expect(new Date(after).getDate()).toBe(12);
    expect(after - late).toBe(30 * 60 * 1000 + 1000);
    expect(checkDue(late + 60_000, late, 0)).toBe(false);
    expect(checkDue(after, late, 0)).toBe(true);
  });
});
