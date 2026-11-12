import { describe, expect, it } from 'vitest';
import { type Box, type BoardLine, align, arrowHead, distribute, drawLine, edgePoint, radialLayout, readLines, readLooks, snap, treeLayout, trees } from './diagram';
import { readPrefs } from './prefs';

const box = (x: number, y: number, w = 100, h = 50, shape: Box['shape'] = 'box'): Box => ({ x, y, w, h, shape });
const line = (from: string, to: string): BoardLine => ({ id: `${from}${to}`, from, to, route: 'straight', ends: 'end' });

describe('lines between cards', () => {
  it('leaves each shape at its outline', () => {
    expect(edgePoint(box(0, 0), [500, 25])).toEqual([100, 25]);
    expect(edgePoint(box(0, 0, 100, 50, 'diamond'), [50, 500])).toEqual([50, 50]);
    const [x, y] = edgePoint(box(0, 0, 100, 50, 'oval'), [150, 75]);
    // On the ellipse: ((x-50)/50)² + ((y-25)/25)² = 1
    expect(((x - 50) / 50) ** 2 + ((y - 25) / 25) ** 2).toBeCloseTo(1);
  });

  it('runs elbow and curved lines between the facing sides', () => {
    const across = drawLine(box(0, 0), box(300, 200), 'elbow');
    expect(across.start).toEqual([100, 25]);
    expect(across.end).toEqual([300, 225]);
    expect(across.d).toBe('M100 25H200V225H300');
    expect(across.endDir).toEqual([1, 0]);
    const down = drawLine(box(0, 0), box(20, 300), 'curved');
    expect(down.start).toEqual([50, 50]);
    expect(down.end).toEqual([70, 300]);
    expect(down.endDir).toEqual([0, 1]);
    expect(down.d.startsWith('M50 50C')).toBe(true);
  });

  it('points an arrowhead back along the line from its tip', () => {
    expect(arrowHead([100, 0], [1, 0], 10)).toBe('100,0 90,4.8 90,-4.8');
  });

  it('reads saved lines and looks, dropping anything damaged', () => {
    expect(readLines({ board: [{ id: 'a', from: 'x', to: 'y', route: 'zigzag', ends: 'both', label: 'yes' }, { id: 3 }], pboard: 'no' })).toEqual({
      board: [{ id: 'a', from: 'x', to: 'y', route: 'curved', ends: 'both', label: 'yes' }],
    });
    expect(readLooks({ board: { a: { shape: 'diamond', colour: 'red' }, b: { shape: 'star' }, c: 4 } })).toEqual({ board: { a: { shape: 'diamond', colour: 'red' } } });
    const read = readPrefs(JSON.stringify({ lines: { board: [line('a', 'b')] } }));
    expect(read.lines.board).toHaveLength(1);
    expect(read.looks).toEqual({});
  });

  it('snaps to the board’s dots', () => {
    expect(snap([13, 15])).toEqual([0, 28]);
  });
});

describe('laying cards out', () => {
  const size = () => [100, 50] as [number, number];
  const at = (spots: Record<string, [number, number]>) => (id: string) => spots[id] ?? [0, 0];

  it('finds the trees the lines make, starting from cards nothing leads to', () => {
    const found = trees(['a', 'b', 'c', 'd', 'e'], [line('a', 'b'), line('a', 'c'), line('c', 'd')]);
    expect(found).toHaveLength(1);
    expect(found[0]!.root).toBe('a');
    expect(found[0]!.kids.get('a')).toEqual(['b', 'c']);
    // A loop still makes a tree.
    expect(trees(['a', 'b'], [line('a', 'b'), line('b', 'a')])[0]!.root).toBe('a');
  });

  it('lays a mindmap out to the right, the root staying put and parents in the middle of their children', () => {
    const out = treeLayout(['a', 'b', 'c', 'd'], [line('a', 'b'), line('a', 'c'), line('a', 'd')], at({ a: [500, 500] }), size, false);
    expect(out.get('a')).toEqual([500, 500]);
    const kids = ['b', 'c', 'd'].map((id) => out.get(id)!);
    expect(new Set(kids.map((k) => k[0]))).toEqual(new Set([720]));
    expect(kids[1]![1]).toBe(500);
    expect(kids[0]![1]).toBeLessThan(kids[1]![1]);
  });

  it('lays a flowchart out downwards, with a second tree beside the first', () => {
    const out = treeLayout(['a', 'b', 'x', 'y'], [line('a', 'b'), line('x', 'y')], at({ a: [0, 0] }), size, true);
    expect(out.get('a')).toEqual([0, 0]);
    expect(out.get('b')).toEqual([0, 122]);
    expect(out.get('x')![0]).toBeGreaterThan(100);
    expect(out.get('y')![1]).toBe(122);
  });

  it('rings the branches around the middle card', () => {
    const out = radialLayout(['m', 'a', 'b', 'c', 'd'], [line('m', 'a'), line('m', 'b'), line('m', 'c'), line('d', 'm')], at({ m: [0, 0] }), size, 'm');
    expect(out.get('m')).toEqual([0, 0]);
    const ds = ['a', 'b', 'c', 'd'].map((id) => Math.hypot(out.get(id)![0] + 50 - 50, out.get(id)![1] + 25 - 25));
    for (const d of ds) expect(d).toBeCloseTo(ds[0]!, 0);
  });

  it('lines cards up and spaces them evenly', () => {
    const boxes = new Map([
      ['a', box(0, 0)],
      ['b', box(50, 40, 100, 80)],
      ['c', box(400, 10)],
    ]);
    expect(align(boxes, 'left').get('c')).toEqual([0, 10]);
    expect(align(boxes, 'bottom').get('a')).toEqual([0, 70]);
    const spread = distribute(boxes, false);
    // From 0 to 500, three cards 100 wide: gaps of 100.
    expect(spread.get('b')).toEqual([200, 40]);
  });
});

describe('which way lines lean', () => {
  it('keeps to the sides on a mindmap and to tops and bottoms on a flowchart', () => {
    const a = box(0, 0);
    const b = box(160, 120);
    expect(drawLine(a, b, 'elbow', 'auto').start).toEqual([50, 50]);
    expect(drawLine(a, b, 'elbow', 'across').start).toEqual([100, 25]);
    expect(drawLine(a, box(300, 10), 'elbow', 'down').start).toEqual([100, 25]);
    expect(drawLine(a, box(300, 200), 'elbow', 'down').start).toEqual([50, 50]);
  });
});
