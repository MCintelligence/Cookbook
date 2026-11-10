import { baseName, parentOf } from '../storage/adapter';
import { BOOKSHELF, type TreeNode, childrenOf, walkFiles } from '../storage/book';
import { LABELS, STATUSES, type Relationship } from '../storage/document';
import { type CardSummary, type Link } from '../storage/index';
import { PANTRY_SECTIONS, SECTION_LABEL, type PantrySection, sectionOf } from '../storage/pantry';
import { MONTHS, type StoryDate, type Ymd, formatDay, fromDayNumber, parseDay, parseWhen, span } from '../storage/storyDate';

/** A file as the views show it: where it is, and what the index knows of it. */
export interface Item {
  path: string;
  card: CardSummary;
  /** The Group (or Pantry section) it is shown under. */
  group: string;
}

export interface Group {
  path: string;
  title: string;
  items: Item[];
}

/** Items that sit on the Shelf outside any Group are shown under this. */
export const LOOSE = 'Not in a Group';

/**
 * The Shelf as the views show it: its top Groups in order, each with all its Items in
 * reading order (Groups inside Groups are read straight through).
 */
export function shelfGroups(tree: TreeNode[], cards: Map<string, CardSummary>): Group[] {
  const groups: Group[] = [];
  const loose: Group = { path: BOOKSHELF, title: LOOSE, items: [] };
  const add = (g: Group, node: TreeNode) => {
    const card = cards.get(node.path);
    if (card && card.kind === 'scene') g.items.push({ path: node.path, card, group: g.path });
  };
  for (const node of tree) {
    if (node.kind === 'file') add(loose, node);
    else {
      const g: Group = { path: node.path, title: node.name, items: [] };
      for (const file of walkFiles(node.children ?? [])) add(g, file);
      groups.push(g);
    }
  }
  return loose.items.length > 0 ? [loose, ...groups] : groups;
}

/** The Pantry as the views show it: Characters, Settings and Materials, each in Pantry order. */
export function pantryGroups(tree: TreeNode[], cards: Map<string, CardSummary>): Group[] {
  const groups = new Map<PantrySection, Group>(PANTRY_SECTIONS.map((s) => [s, { path: `pantry/${s}`, title: SECTION_LABEL[s], items: [] }]));
  for (const file of walkFiles(tree)) {
    const card = cards.get(file.path);
    const section = sectionOf(file.path);
    if (card && section && card.kind !== 'scene' && card.kind !== 'recipe') groups.get(section)!.items.push({ path: file.path, card, group: `pantry/${section}` });
  }
  return [...groups.values()];
}

/**
 * Where a Shelf Item dropped in a Group goes: just before `before`, or at the Group's end.
 * The answer is what the Shelf's own move takes: a folder, and a place among what it holds.
 */
export function dropPlace(tree: TreeNode[], group: string, before: string | null): { folder: string; at: number } {
  if (before) {
    const folder = parentOf(before);
    const at = childrenOf(tree, BOOKSHELF, folder).findIndex((n) => n.path === before);
    if (at !== -1) return { folder, at };
  }
  return { folder: group, at: childrenOf(tree, BOOKSHELF, group).length };
}

export interface Row {
  id: string;
  title: string;
  color?: string;
}

/** The rows of a grid board: none, one for each plotline (a label colour), or one for each status. */
export function boardRows(by: 'none' | 'label' | 'status', items: Item[], plotlines: Record<string, string>): Row[] {
  if (by === 'status') return STATUSES.map((s) => ({ id: s.id, title: s.label }));
  if (by === 'label') {
    const used = new Set(items.map((i) => i.card.label));
    return [{ id: '', title: 'No plotline' }, ...LABELS.filter((l) => used.has(l.id) || plotlines[l.id] !== undefined).map((l) => ({ id: l.id, title: plotlines[l.id] || l.name, color: l.color }))];
  }
  return [{ id: '', title: '' }];
}

export function rowOf(by: 'none' | 'label' | 'status', card: CardSummary): string {
  return by === 'status' ? card.status : by === 'label' ? card.label : '';
}

export const labelColor = (id: string): string | undefined => LABELS.find((l) => l.id === id)?.color;

/** What a plotline is called: the writer's name for it, or the colour's own. */
export const plotlineName = (id: string, plotlines: Record<string, string>): string => plotlines[id] || LABELS.find((l) => l.id === id)?.name || 'No plotline';

/** The ties an Item has to others, as its file keeps them, gathered from every tie in the Pantry. */
export function tiesOf(links: Link[], path: string): Relationship[] {
  return links.filter((l) => l.from === path).map((l) => ({ to: l.to, as: l.as }));
}

/** One line between two Pantry Items, with how each end reads. */
export interface Tie {
  a: string;
  b: string;
  /** How a is tied to b ("Mother of"), and b to a, where they say. */
  ab: string | null;
  ba: string | null;
}

/** Every tie as one line a pair, whichever of the two (or both) says so. Ties to Items that are gone are left out. */
export function pairTies(links: Link[], idOf: (path: string) => string | undefined, known: Set<string>): Tie[] {
  const pairs = new Map<string, Tie>();
  for (const l of links) {
    const from = idOf(l.from);
    if (!from || !known.has(from) || !known.has(l.to) || from === l.to) continue;
    const [a, b] = from < l.to ? [from, l.to] : [l.to, from];
    const tie = pairs.get(`${a} ${b}`) ?? { a, b, ab: null, ba: null };
    if (from === a) tie.ab = l.as;
    else tie.ba = l.as;
    pairs.set(`${a} ${b}`, tie);
  }
  return [...pairs.values()];
}

/**
 * Somewhere to put the Items of an atlas that haven't been placed by hand: those tied together
 * drawn together, the rest spread round them. The same Items always land in the same places.
 */
export function layOut(ids: string[], ties: { a: string; b: string }[], placed: Record<string, [number, number]>): Record<string, [number, number]> {
  const at: Record<string, [number, number]> = {};
  const loose = ids.filter((id) => !placed[id]);
  const radius = 90 + ids.length * 22;
  ids.forEach((id, i) => {
    const turn = (i / Math.max(1, ids.length)) * Math.PI * 2;
    at[id] = placed[id] ?? [Math.cos(turn) * radius, Math.sin(turn) * radius];
  });
  if (loose.length === 0) return at;
  const free = new Set(loose);
  for (let step = 0; step < 240; step++) {
    const push: Record<string, [number, number]> = Object.fromEntries(loose.map((id) => [id, [0, 0]]));
    const heat = 1 - step / 240;
    for (const p of loose) {
      for (const q of ids) {
        if (p === q) continue;
        const dx = at[p]![0] - at[q]![0];
        const dy = at[p]![1] - at[q]![1];
        const d2 = Math.max(400, dx * dx + dy * dy);
        const f = 52000 / d2;
        const d = Math.sqrt(d2);
        push[p]![0] += (dx / d) * f;
        push[p]![1] += (dy / d) * f;
      }
      // A gentle pull to the middle keeps the untied from drifting off.
      push[p]![0] -= at[p]![0] * 0.012;
      push[p]![1] -= at[p]![1] * 0.012;
    }
    for (const t of ties) {
      if (!at[t.a] || !at[t.b]) continue;
      const dx = at[t.b][0] - at[t.a][0];
      const dy = at[t.b][1] - at[t.a][1];
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - 210) * 0.06;
      if (free.has(t.a)) {
        push[t.a]![0] += (dx / d) * f;
        push[t.a]![1] += (dy / d) * f;
      }
      if (free.has(t.b)) {
        push[t.b]![0] -= (dx / d) * f;
        push[t.b]![1] -= (dy / d) * f;
      }
    }
    for (const p of loose) {
      const [fx, fy] = push[p]!;
      const size = Math.hypot(fx, fy);
      const cap = Math.min(size, 40 * heat + 2);
      if (size > 0) at[p] = [at[p]![0] + (fx / size) * cap, at[p]![1] + (fy / size) * cap];
    }
  }
  for (const p of loose) at[p] = [Math.round(at[p]![0]), Math.round(at[p]![1])];
  return at;
}

/** Something with a date, as the calendar and timeline draw it. */
export interface Dated {
  key: string;
  path: string;
  title: string;
  date: StoryDate;
  first: number;
  last: number;
  /** A Pantry Item's event rather than a Shelf Item's own day, and which of its events. */
  event: number | null;
  card: CardSummary;
  group: string;
}

export function datedOf(items: Item[], pantry: boolean): Dated[] {
  return items.flatMap((item) =>
    (pantry ? item.card.dates : item.card.dates.slice(0, 1)).flatMap((date, i) => {
      if (!parseDay(date.on)) return [];
      const [first, last] = span(date);
      return [{ key: `${item.card.id}:${i}`, path: item.path, title: pantry ? `${item.card.title}${date.what ? `: ${date.what}` : ''}` : item.card.title, date, first, last, event: pantry ? i : null, card: item.card, group: item.group }];
    }),
  );
}

/** A day as a writer types it: "1954-09-03", "3 September 1954", "3 Sep 1954" or "September 3, 1954". */
export function readDay(text: string): Ymd | null {
  const typed = text.trim().replace(/\s+/g, ' ');
  const plain = parseDay(typed);
  if (plain) return plain;
  const found = /^(\d{1,2}) ([A-Za-z]{3,})\.?,? (\d{1,5})$/.exec(typed) ?? /^([A-Za-z]{3,})\.? (\d{1,2}),? (\d{1,5})$/.exec(typed);
  if (!found) return null;
  const [d, name, y] = /^\d/.test(found[1]!) ? [found[1]!, found[2]!, found[3]!] : [found[2]!, found[1]!, found[3]!];
  const m = MONTHS.findIndex((month) => month.toLowerCase().startsWith(name.toLowerCase())) + 1;
  return m > 0 ? parseDay(`${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`) : null;
}

/** A date typed into the date box: "1954-09-03", with an optional last day. Null when it isn't one. */
export function typedDate(from: string, to: string): StoryDate | null {
  const a = readDay(from);
  if (!a) return null;
  if (!to.trim()) return { on: formatDay(a) };
  const b = readDay(to);
  return b ? parseWhen(`${formatDay(a)}/${formatDay(b)}`) : null;
}

export const dayText = (n: number): string => formatDay(fromDayNumber(n));

/**
 * Puts bars that would overlap on rows of their own. Each bar is [left, right] in pixels,
 * and the answer is the row for each, in the order given.
 */
export function packRows(bars: [number, number][], gap = 8): number[] {
  const ends: number[] = [];
  const order = bars.map((_, i) => i).sort((p, q) => bars[p]![0] - bars[q]![0] || p - q);
  const rows = new Array<number>(bars.length).fill(0);
  for (const i of order) {
    const [left, right] = bars[i]!;
    let row = ends.findIndex((end) => end + gap <= left);
    if (row === -1) row = ends.length;
    ends[row] = right;
    rows[i] = row;
  }
  return rows;
}

/** The reading order of a free board: top to bottom in rows, left to right along each. */
export function readingOrder<T>(things: T[], spot: (t: T) => [number, number], rowHeight: number): T[] {
  return [...things].sort((p, q) => {
    const [px, py] = spot(p);
    const [qx, qy] = spot(q);
    const rows = Math.round(py / rowHeight) - Math.round(qy / rowHeight);
    return rows || px - qx;
  });
}

export const fileTitle = (path: string): string => baseName(path).replace(/\.md$/, '');
