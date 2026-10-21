import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from './memory';
import { loadHistory, parseHistory, recordWords, saveHistory, serializeHistory, summarize, type WritingHistory } from './history';

const at = (s: string) => new Date(`${s}T12:00:00`);

describe('writing history', () => {
  it('adds written and deleted words to the day', () => {
    let h: WritingHistory = new Map();
    h = recordWords(h, 120, at('2026-10-21'));
    h = recordWords(h, -20, at('2026-10-21'));
    h = recordWords(h, 0, at('2026-10-21'));
    h = recordWords(h, 50, at('2026-10-20'));
    expect(serializeHistory(h)).toBe('date,written,deleted\n2026-10-20,50,0\n2026-10-21,120,20\n');
  });

  it('reads its own file and skips lines it does not understand', async () => {
    const fs = new MemoryAdapter();
    expect((await loadHistory(fs)).size).toBe(0);
    await saveHistory(fs, parseHistory('date,written,deleted\n2026-10-20,50,0\nnonsense\n2026-10-21,7,1\r\n'));
    expect([...(await loadHistory(fs)).entries()]).toEqual([
      ['2026-10-20', { written: 50, deleted: 0 }],
      ['2026-10-21', { written: 7, deleted: 1 }],
    ]);
  });

  it('works out today, the streak, recent days, months and the best day', () => {
    const h = parseHistory(
      ['2026-07-02,400,0', '2026-09-30,900,100', '2026-10-17,300,0', '2026-10-18,0,40', '2026-10-19,500,0', '2026-10-20,1710,10', '2026-10-21,1240,0'].join('\n'),
    );
    const s = summarize(h, at('2026-10-21'), 5);
    expect(s.today).toBe(1240);
    expect(s.streak).toBe(3);
    expect(s.recent).toEqual([
      { day: '2026-10-17', words: 300 },
      { day: '2026-10-18', words: 0 },
      { day: '2026-10-19', words: 500 },
      { day: '2026-10-20', words: 1700 },
      { day: '2026-10-21', words: 1240 },
    ]);
    expect(s.months.map((m) => [m.label, m.words])).toEqual([['Jul', 400], ['Aug', 0], ['Sep', 800], ['Oct', 3740]]);
    expect(s.best).toEqual({ day: '2026-10-20', words: 1700 });
  });

  it('keeps a streak going until the end of today', () => {
    const h = parseHistory('2026-10-19,10,0\n2026-10-20,10,0');
    expect(summarize(h, at('2026-10-21')).streak).toBe(2);
    expect(summarize(h, at('2026-10-22')).streak).toBe(0);
  });
});
