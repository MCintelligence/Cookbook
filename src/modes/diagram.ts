/**
 * The drawing side of the free board, for writers who use it as a mindmap or a flowchart:
 * the shapes a card can take, the lines between cards, and the ways of laying cards out
 * (a tree, a circle, in line, evenly spaced). Pure geometry, so it is tested without a screen.
 */
import { type Spot } from './prefs';

export type Shape = 'box' | 'rounded' | 'oval' | 'diamond';
export type Route = 'straight' | 'elbow' | 'curved';
export type Ends = 'none' | 'end' | 'both';
export type CardSize = 'full' | 'titles';
/** Which way the board's lines lean: sideways like a mindmap, downwards like a flowchart, or whichever way is shorter. */
export type Flow = 'auto' | 'across' | 'down';

export const SHAPES: { id: Shape; name: string }[] = [
  { id: 'box', name: 'Box' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'oval', name: 'Oval' },
  { id: 'diamond', name: 'Diamond' },
];
export const ROUTES: { id: Route; name: string }[] = [
  { id: 'straight', name: 'Straight' },
  { id: 'elbow', name: 'Elbow' },
  { id: 'curved', name: 'Curved' },
];
export const ENDS: { id: Ends; name: string }[] = [
  { id: 'none', name: 'No arrows' },
  { id: 'end', name: 'Arrow at the end' },
  { id: 'both', name: 'Arrows at both ends' },
];

/** A line drawn on a free board, from one card to another, by the cards' ids. */
export interface BoardLine {
  id: string;
  from: string;
  to: string;
  route: Route;
  ends: Ends;
  label?: string;
}

/** How a card looks on a free board, beyond what the Item itself says. */
export interface CardLook {
  shape?: Shape;
  colour?: string;
}

/** A card's place and size on the board, its top left corner first. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
}

/** The size of a card, where its shape fixes it. Box and Rounded full cards grow with their words, so they give only a width. */
export function fixedSize(shape: Shape, size: CardSize): [number, number | null] {
  if (size === 'titles') return shape === 'diamond' ? [200, 100] : shape === 'oval' ? [184, 68] : [168, 56];
  return shape === 'diamond' ? [288, 184] : shape === 'oval' ? [248, 152] : [224, null];
}

/** The snap grid: the same 28px as the dots on the board. */
export const GRID = 28;
export const snap = (spot: Spot): Spot => [Math.round(spot[0] / GRID) * GRID, Math.round(spot[1] / GRID) * GRID];

const centre = (b: Box): Spot => [b.x + b.w / 2, b.y + b.h / 2];

/** Where a ray from the middle of a box towards `to` leaves the box's outline. */
export function edgePoint(b: Box, to: Spot): Spot {
  const [cx, cy] = centre(b);
  const dx = to[0] - cx;
  const dy = to[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const a = b.w / 2;
  const c = b.h / 2;
  let t: number;
  if (b.shape === 'oval') t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (c * c));
  else if (b.shape === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / c);
  else t = Math.min(dx === 0 ? Infinity : a / Math.abs(dx), dy === 0 ? Infinity : c / Math.abs(dy));
  return [cx + dx * t, cy + dy * t];
}

/** A line's drawing: its SVG path, the point for its label, and its two ends with the way each faces out of its card. */
export interface Drawn {
  d: string;
  mid: Spot;
  start: Spot;
  end: Spot;
  /** Unit vectors pointing into the card at each end, the way an arrowhead there points. */
  startDir: Spot;
  endDir: Spot;
}

const unit = (dx: number, dy: number): Spot => {
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
const r = (n: number) => Math.round(n * 10) / 10;

/**
 * The line from box `a` to box `b`. Straight lines run between the cards' middles. Elbow and
 * curved lines leave from the middle of the sides that face each other: left and right when
 * the cards are further apart across than down, top and bottom otherwise. A board laid out as a
 * mindmap (`across`) keeps to the sides wherever it can, and one laid out as a flowchart (`down`)
 * to the tops and bottoms.
 */
export function drawLine(a: Box, b: Box, route: Route, flow: Flow = 'auto'): Drawn {
  const ca = centre(a);
  const cb = centre(b);
  if (route === 'straight') {
    const start = edgePoint(a, cb);
    const end = edgePoint(b, ca);
    const dir = unit(end[0] - start[0], end[1] - start[1]);
    return { d: `M${r(start[0])} ${r(start[1])}L${r(end[0])} ${r(end[1])}`, mid: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], start, end, startDir: [-dir[0], -dir[1]], endDir: dir };
  }
  // The gaps between the cards' edges, across and down; a negative gap means they overlap that way.
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  const across = flow === 'across' ? gapX > 0 || gapY <= 0 : flow === 'down' ? !(gapY > 0 || gapX <= 0) : gapX >= gapY;
  const sx = across ? (cb[0] >= ca[0] ? 1 : -1) : 0;
  const sy = across ? 0 : cb[1] >= ca[1] ? 1 : -1;
  const start: Spot = [ca[0] + (sx * a.w) / 2, ca[1] + (sy * a.h) / 2];
  const end: Spot = [cb[0] - (sx * b.w) / 2, cb[1] - (sy * b.h) / 2];
  const endDir: Spot = [sx, sy];
  const startDir: Spot = [-sx, -sy];
  if (route === 'elbow') {
    if (across) {
      const mx = (start[0] + end[0]) / 2;
      return { d: `M${r(start[0])} ${r(start[1])}H${r(mx)}V${r(end[1])}H${r(end[0])}`, mid: [mx, (start[1] + end[1]) / 2], start, end, startDir, endDir };
    }
    const my = (start[1] + end[1]) / 2;
    return { d: `M${r(start[0])} ${r(start[1])}V${r(my)}H${r(end[0])}V${r(end[1])}`, mid: [(start[0] + end[0]) / 2, my], start, end, startDir, endDir };
  }
  const reach = Math.max(36, (across ? Math.abs(end[0] - start[0]) : Math.abs(end[1] - start[1])) * 0.5);
  const c1: Spot = [start[0] + sx * reach, start[1] + sy * reach];
  const c2: Spot = [end[0] - sx * reach, end[1] - sy * reach];
  // The middle of a cubic curve, at t = ½.
  const mid: Spot = [(start[0] + 3 * c1[0] + 3 * c2[0] + end[0]) / 8, (start[1] + 3 * c1[1] + 3 * c2[1] + end[1]) / 8];
  return { d: `M${r(start[0])} ${r(start[1])}C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(end[0])} ${r(end[1])}`, mid, start, end, startDir, endDir };
}

/** An arrowhead's three corners, its tip at `tip`, pointing along `dir`. */
export function arrowHead(tip: Spot, dir: Spot, size = 11): string {
  const [ux, uy] = dir;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const half = size * 0.48;
  const corners: Spot[] = [tip, [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]];
  return corners.map((p) => `${r(p[0])},${r(p[1])}`).join(' ');
}

// ---------- Laying out ----------

/** Who each card leads to, and who leads to it, along the lines. */
function graph(ids: string[], lines: BoardLine[]) {
  const known = new Set(ids);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const into = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const l of lines) {
    if (!known.has(l.from) || !known.has(l.to) || l.from === l.to) continue;
    out.get(l.from)!.push(l.to);
    into.set(l.to, into.get(l.to)! + 1);
  }
  return { out, into };
}

/** The trees the lines make: each a root with its branches, every card in only one tree. Cards with no lines are left out. */
export function trees(ids: string[], lines: BoardLine[], firstRoot?: string): { root: string; kids: Map<string, string[]> }[] {
  const { out, into } = graph(ids, lines);
  const touched = new Set<string>();
  for (const [id, to] of out) if (to.length > 0) [id, ...to].forEach((t) => touched.add(t));
  const seen = new Set<string>();
  const found: { root: string; kids: Map<string, string[]> }[] = [];
  const grow = (root: string) => {
    const kids = new Map<string, string[]>();
    const queue = [root];
    seen.add(root);
    while (queue.length) {
      const at = queue.shift()!;
      const mine: string[] = [];
      for (const next of out.get(at) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        mine.push(next);
        queue.push(next);
      }
      kids.set(at, mine);
    }
    found.push({ root, kids });
  };
  // Roots first: the card asked for, then cards nothing leads to, then whatever a loop leaves over.
  const order = [...(firstRoot && touched.has(firstRoot) ? [firstRoot] : []), ...ids.filter((id) => touched.has(id) && into.get(id) === 0), ...ids.filter((id) => touched.has(id))];
  for (const id of order) if (!seen.has(id)) grow(id);
  return found;
}

type Sizes = (id: string) => [number, number];

/**
 * The cards along the lines as trees: left to right like a mindmap, or top to bottom like a
 * flowchart. The first tree starts where its root card is now, and any others line up after it,
 * below for a mindmap and to the right for a flowchart, so no two trees overlap.
 */
export function treeLayout(ids: string[], lines: BoardLine[], at: (id: string) => Spot, size: Sizes, down: boolean, firstRoot?: string): Map<string, Spot> {
  const placed = new Map<string, Spot>();
  const GAP_LEVEL = down ? 72 : 120;
  const GAP_SIB = down ? 32 : 20;
  const all = trees(ids, lines, firstRoot);
  if (all.length === 0) return placed;
  const first = all[0]!.root;
  const [ox, oy] = at(first);
  // Where the next tree may start, across the trees; null until the first is placed around its root.
  let cursor: number | null = null;
  for (const { root, kids } of all) {
    // How deep each card is, and the room each level needs along the tree.
    const level = new Map<string, number>([[root, 0]]);
    const depthRoom: number[] = [];
    const walk = (id: string) => {
      const [w, h] = size(id);
      const d = level.get(id)!;
      depthRoom[d] = Math.max(depthRoom[d] ?? 0, down ? h : w);
      for (const k of kids.get(id) ?? []) {
        level.set(k, d + 1);
        walk(k);
      }
    };
    walk(root);
    const levelAt: number[] = [];
    depthRoom.reduce((sum, room, d) => ((levelAt[d] = sum), sum + room + GAP_LEVEL), 0);
    // Across the tree, each leaf takes the next slot and each parent sits in the middle of its children.
    let next = 0;
    const across = new Map<string, number>();
    const place = (id: string): [number, number] => {
      const breadth = down ? size(id)[0] : size(id)[1];
      const mine = kids.get(id) ?? [];
      if (mine.length === 0) {
        const lo = next;
        next += breadth + GAP_SIB;
        across.set(id, lo + breadth / 2);
        return [lo, lo + breadth];
      }
      const spans = mine.map(place);
      const middle = (spans[0]![0] + spans[spans.length - 1]![1]) / 2;
      across.set(id, middle);
      // A parent wider than its children pushes what comes after along.
      next = Math.max(next, middle + breadth / 2 + GAP_SIB);
      return [Math.min(spans[0]![0], middle - breadth / 2), Math.max(spans[spans.length - 1]![1], middle + breadth / 2)];
    };
    const [lo, hi] = place(root);
    // The first tree's root stays where it is; the trees after it line up beyond it.
    const shift: number = cursor === null ? (down ? ox + size(root)[0] / 2 : oy + size(root)[1] / 2) - across.get(root)! : cursor - lo;
    for (const [id, mid] of across) {
      const [w, h] = size(id);
      const along = levelAt[level.get(id)!]!;
      placed.set(id, down ? [Math.round(mid + shift - w / 2), Math.round(oy + along)] : [Math.round(ox + along), Math.round(mid + shift - h / 2)]);
    }
    cursor = hi + shift + 80;
  }
  return placed;
}

/**
 * The cards along the lines in rings around a middle card, like a mindmap drawn from the centre:
 * its branches on the first ring, theirs on the next, each branch keeping a slice of the circle
 * as wide as the leaves it carries. The middle card stays where it is. Only the first tree is
 * laid out this way; the middle card is `middle` if it has lines, or the first tree's root.
 */
export function radialLayout(ids: string[], lines: BoardLine[], at: (id: string) => Spot, size: Sizes, middle?: string): Map<string, Spot> {
  const placed = new Map<string, Spot>();
  // Lines count both ways around a circle: a card's branches are everything tied to it.
  const both = lines.flatMap((l) => [l, { ...l, from: l.to, to: l.from }]);
  const centre = trees(ids, lines, middle)[0]?.root;
  const tree = centre ? trees(ids, both, centre)[0] : undefined;
  if (!tree) return placed;
  const { root, kids } = tree;
  const leaves = new Map<string, number>();
  const count = (id: string): number => {
    const mine = kids.get(id) ?? [];
    const n = mine.length === 0 ? 1 : mine.reduce((s, k) => s + count(k), 0);
    leaves.set(id, n);
    return n;
  };
  count(root);
  const biggest = Math.max(...[...kids.keys()].map((id) => Math.hypot(...size(id))));
  const ring = biggest + 60;
  const [rx, ry] = at(root);
  const [rw, rh] = size(root);
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  placed.set(root, [rx, ry]);
  const spread = (id: string, from: number, to: number, depth: number) => {
    const mine = kids.get(id) ?? [];
    const total = mine.reduce((s, k) => s + leaves.get(k)!, 0);
    let a = from;
    for (const k of mine) {
      const share = ((to - from) * leaves.get(k)!) / total;
      const angle = a + share / 2;
      const [w, h] = size(k);
      // Outer rings get a little more room, as there are usually more cards on them.
      const radius = ring * depth * (depth > 1 ? 1.05 : 1);
      placed.set(k, [Math.round(cx + Math.cos(angle) * radius - w / 2), Math.round(cy + Math.sin(angle) * radius - h / 2)]);
      spread(k, a, a + share, depth + 1);
      a += share;
    }
  };
  // Starting from the top, going clockwise.
  spread(root, -Math.PI / 2, Math.PI * 1.5, 1);
  return placed;
}

export type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';
export const ALIGNS: { id: Align; name: string }[] = [
  { id: 'left', name: 'Left edges' },
  { id: 'centre', name: 'Centres' },
  { id: 'right', name: 'Right edges' },
  { id: 'top', name: 'Top edges' },
  { id: 'middle', name: 'Middles' },
  { id: 'bottom', name: 'Bottom edges' },
];

/** The cards lined up on one edge or their middles, by the outermost of them (or the average, for middles). */
export function align(boxes: Map<string, Box>, how: Align): Map<string, Spot> {
  const all = [...boxes.values()];
  const left = Math.min(...all.map((b) => b.x));
  const right = Math.max(...all.map((b) => b.x + b.w));
  const top = Math.min(...all.map((b) => b.y));
  const bottom = Math.max(...all.map((b) => b.y + b.h));
  const cx = all.reduce((s, b) => s + b.x + b.w / 2, 0) / all.length;
  const cy = all.reduce((s, b) => s + b.y + b.h / 2, 0) / all.length;
  const out = new Map<string, Spot>();
  for (const [id, b] of boxes) {
    const x = how === 'left' ? left : how === 'right' ? right - b.w : how === 'centre' ? cx - b.w / 2 : b.x;
    const y = how === 'top' ? top : how === 'bottom' ? bottom - b.h : how === 'middle' ? cy - b.h / 2 : b.y;
    out.set(id, [Math.round(x), Math.round(y)]);
  }
  return out;
}

/** The cards spaced so the gaps between them are equal, across or down. The first and last stay put. */
export function distribute(boxes: Map<string, Box>, down: boolean): Map<string, Spot> {
  const order = [...boxes.entries()].sort((a, b) => (down ? a[1].y - b[1].y : a[1].x - b[1].x));
  const out = new Map<string, Spot>();
  if (order.length < 3) return out;
  const first = order[0]![1];
  const last = order[order.length - 1]![1];
  const room = down ? last.y + last.h - first.y : last.x + last.w - first.x;
  const used = order.reduce((s, [, b]) => s + (down ? b.h : b.w), 0);
  const gap = (room - used) / (order.length - 1);
  let at = down ? first.y : first.x;
  for (const [id, b] of order) {
    out.set(id, down ? [b.x, Math.round(at)] : [Math.round(at), b.y]);
    at += (down ? b.h : b.w) + gap;
  }
  return out;
}

/** A fresh id for a line. */
export const lineId = (): string => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const ROUTE_IDS = new Set<string>(ROUTES.map((r) => r.id));
const END_IDS = new Set<string>(ENDS.map((e) => e.id));
const SHAPE_IDS = new Set<string>(SHAPES.map((s) => s.id));

/** The lines of a modes.json, with anything damaged dropped. */
export function readLines(raw: unknown): Record<string, BoardLine[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, BoardLine[]> = {};
  for (const [board, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    out[board] = list.flatMap((l): BoardLine[] => {
      if (!l || typeof l !== 'object' || typeof l.id !== 'string' || typeof l.from !== 'string' || typeof l.to !== 'string') return [];
      return [{ id: l.id, from: l.from, to: l.to, route: ROUTE_IDS.has(l.route) ? l.route : 'curved', ends: END_IDS.has(l.ends) ? l.ends : 'end', ...(typeof l.label === 'string' && l.label ? { label: l.label } : {}) }];
    });
  }
  return out;
}

/** The card looks of a modes.json, with anything damaged dropped. */
export function readLooks(raw: unknown): Record<string, Record<string, CardLook>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, CardLook>> = {};
  for (const [board, looks] of Object.entries(raw)) {
    if (!looks || typeof looks !== 'object' || Array.isArray(looks)) continue;
    const mine: Record<string, CardLook> = {};
    for (const [id, look] of Object.entries(looks as Record<string, unknown>)) {
      if (!look || typeof look !== 'object') continue;
      const { shape, colour } = look as Record<string, unknown>;
      const keep: CardLook = {};
      if (typeof shape === 'string' && SHAPE_IDS.has(shape)) keep.shape = shape as Shape;
      if (typeof colour === 'string' && /^[a-z]+$/.test(colour)) keep.colour = colour;
      if (keep.shape || keep.colour) mine[id] = keep;
    }
    out[board] = mine;
  }
  return out;
}
