// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { firstSeen, keepStill } from './scrollAnchor';

/** A scrolling box with children of given heights, laid out by hand since jsdom draws nothing. */
function laidOut(heights: number[]) {
  const box = document.body.appendChild(document.createElement('div'));
  const page = box.appendChild(document.createElement('div'));
  const kids = heights.map(() => page.appendChild(document.createElement('section')));
  let scroll = 0;
  Object.defineProperty(box, 'scrollTop', { get: () => scroll, set: (v: number) => (scroll = v) });
  box.getBoundingClientRect = () => new DOMRect(0, 100, 500, 400);
  const place = () => {
    let y = 100 - scroll;
    kids.forEach((k, i) => {
      const top = y;
      k.getBoundingClientRect = () => new DOMRect(0, top, 500, heights[i]!);
      y += heights[i]!;
    });
  };
  place();
  return { box, page, kids, heights, place, scroll: (v: number) => ((scroll = v), place()) };
}

describe('keeping the page still', () => {
  it('keeps still the first thing that starts on screen, not one whose end only shows', () => {
    const t = laidOut([300, 300, 300, 300]);
    t.scroll(450);
    expect(firstSeen(t.box, t.page)).toEqual({ el: t.kids[2], top: 150 });
  });

  it('keeps still the one at the top when one long Item fills the screen', () => {
    const t = laidOut([300, 2000, 300]);
    t.scroll(450);
    expect(firstSeen(t.box, t.page)).toEqual({ el: t.kids[1], top: -150 });
  });

  it('moves with an Item above that loads shorter than its estimate, whose end was showing', () => {
    const t = laidOut([2352, 40, 300]);
    t.scroll(2300);
    const seen = firstSeen(t.box, t.page);
    expect(seen?.el).toBe(t.kids[1]);
    t.heights[0] = 2064;
    t.place();
    keepStill(t.box, seen);
    expect(t.box.scrollTop).toBe(2012);
  });

  it('scrolls by as much as something above the screen grew, so what is read stays put', () => {
    const t = laidOut([100, 300, 300]);
    t.scroll(150);
    const seen = firstSeen(t.box, t.page);
    expect(seen?.el).toBe(t.kids[2]);
    expect(seen?.top).toBe(250);
    // The first Item loads and is 250px taller than its estimate.
    t.heights[0] = 350;
    t.place();
    keepStill(t.box, seen);
    expect(t.box.scrollTop).toBe(400);
    t.place();
    expect(firstSeen(t.box, t.page)).toEqual(seen);
  });

  it('leaves the page alone when nothing above moved', () => {
    const t = laidOut([100, 300, 300]);
    t.scroll(150);
    const seen = firstSeen(t.box, t.page);
    t.heights[2] = 900;
    t.place();
    keepStill(t.box, seen);
    expect(t.box.scrollTop).toBe(150);
  });
});
