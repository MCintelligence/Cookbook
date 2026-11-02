// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PaginateCancelled, paginate } from './layout';
import { DEFAULT_PLATE } from './settings';

// jsdom lays nothing out, so every chapter fits on its opener page; what's tested here is that the
// work is done in slices, gives the browser a turn between them, and can be called off.
const book = {
  title: 'The Summer Kitchen',
  chapters: Array.from({ length: 30 }, (_, i) => ({ path: `bookshelf/Ch ${i + 1}.md`, title: `Chapter ${i + 1}`, html: '<p>The kitchen smelled of cornbread.</p>'.repeat(5), words: 25 })),
};

describe('setting the pages of a long book', () => {
  it('sets every chapter, pausing for the browser and telling how far it has got', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    const told: number[] = [];
    let turns = 0;
    const pages = await paginate(host, DEFAULT_PLATE, book, { slice: 0, progress: (n) => told.push(n), live: () => (turns++, true) });
    expect(pages.filter((p) => p.opener)).toHaveLength(30);
    // With no time to work in, it pauses before each chapter's page.
    expect(turns).toBeGreaterThanOrEqual(30);
    expect(told.at(-1)).toBeGreaterThan(told[0]!);
    // The measuring box is cleared away.
    expect(host.childElementCount).toBe(0);
  });

  it('stops at its next pause once it is no longer wanted, and cleans up', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    let turns = 0;
    await expect(paginate(host, DEFAULT_PLATE, book, { slice: 0, live: () => ++turns < 3 })).rejects.toBeInstanceOf(PaginateCancelled);
    expect(turns).toBe(3);
    expect(host.childElementCount).toBe(0);
  });

  it('runs in one go when there is time', async () => {
    const host = document.body.appendChild(document.createElement('div'));
    let turns = 0;
    await paginate(host, DEFAULT_PLATE, book, { slice: 60_000, live: () => (turns++, true) });
    expect(turns).toBe(0);
  });
});
