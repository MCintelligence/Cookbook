import { type TreeNode } from '../storage/book';

/**
 * Mise en Place: a Group's Items joined into one page, in Shelf order, with the
 * names of the Groups inside it as dividers. These are the parts that need no screen.
 */
export type MiseEntry =
  | { type: 'group'; path: string; name: string; depth: number }
  | { type: 'item'; path: string; name: string };

/** The Group at `path`, wherever it sits on the Shelf. */
export function findGroup(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.kind !== 'folder') continue;
    if (n.path === path) return n;
    if (path.startsWith(n.path + '/')) return findGroup(n.children ?? [], path);
  }
  return null;
}

/** The Group or Item at `path`, wherever it sits on the Shelf. */
export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.kind === 'folder' && path.startsWith(n.path + '/')) return findNode(n.children ?? [], path);
  }
  return null;
}

/** Whether `path` is inside the Group `group`, at any depth. */
export const isInside = (path: string, group: string): boolean => path.startsWith(group + '/');

/** The Group's own name, then everything inside it in Shelf order: Groups as dividers, Items as pages. */
export function miseEntries(group: TreeNode): MiseEntry[] {
  return miseEntriesOf([group]);
}

/**
 * Several Groups (and Items picked on their own) one after another, each Group under its own
 * name. `roots` are in Shelf order and none is inside another.
 */
export function miseEntriesOf(roots: TreeNode[]): MiseEntry[] {
  const out: MiseEntry[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (n.kind === 'file') out.push({ type: 'item', path: n.path, name: n.name.replace(/\.md$/, '') });
      else {
        out.push({ type: 'group', path: n.path, name: n.name, depth });
        walk(n.children ?? [], depth + 1);
      }
    }
  };
  walk(roots, 0);
  return out;
}

/** Whether `path` is one of `roots` or inside one of them. */
export const inRoots = (path: string, roots: readonly string[]): boolean => roots.some((r) => path === r || isInside(path, r));

/** What Mise en Place shows: some Groups (and Items picked on their own), in Shelf order. */
export interface MiseView {
  /** The Groups and Items shown, in Shelf order, none inside another. */
  roots: string[];
  /** The Group the page opens at: the one clicked, with the Groups before it above and those after below. */
  anchor: string;
  /** Where typing into an all-empty page makes the first Item: the Group picked first, or the top one after Select all. */
  target: string;
}

/**
 * The view for Groups and Items picked on the Shelf, or null if no Group is among them. `picked`
 * is in the order they were picked; Select all picks in Shelf order. The anchor stays where it
 * was if it is still shown, so adding Groups never moves the page; otherwise it is the first
 * Group picked.
 */
export function viewOfPicked(picked: Iterable<string>, shelf: TreeNode[], anchorBefore: string | null): MiseView | null {
  const order = new Map<string, number>();
  const folders = new Set<string>();
  let n = 0;
  const walk = (nodes: TreeNode[]) =>
    nodes.forEach((x) => {
      order.set(x.path, n++);
      if (x.kind === 'folder') {
        folders.add(x.path);
        walk(x.children ?? []);
      }
    });
  walk(shelf);
  const list = [...picked].filter((p) => order.has(p));
  const top = list.filter((p) => !list.some((q) => q !== p && isInside(p, q)));
  const groupsInOrder = top.filter((p) => folders.has(p));
  if (groupsInOrder.length === 0) return null;
  const roots = [...top].sort((a, b) => order.get(a)! - order.get(b)!);
  const anchor = anchorBefore && inRoots(anchorBefore, roots) && folders.has(anchorBefore) ? anchorBefore : groupsInOrder[0]!;
  return { roots, anchor, target: groupsInOrder[0]! };
}

/** The Items alone, in order. */
export const miseItems = (entries: MiseEntry[]): string[] => entries.filter((e) => e.type === 'item').map((e) => e.path);

/** The Item before or after `path`, for the arrow keys at the edge of an Item. */
export function itemBeside(items: string[], path: string, dir: -1 | 1): string | null {
  const i = items.indexOf(path);
  return i === -1 ? null : (items[i + dir] ?? null);
}

/**
 * How tall an Item that hasn't loaded yet is drawn, from its word count, so the
 * scroll bar is about right before it loads. About eleven words to a line of 28px.
 */
export const estimatedHeight = (words: number): number => Math.max(56, Math.round((words / 11) * 28));

/** Total words in the Group: the open Item as it is now, the rest as last saved. */
export function miseWords(items: string[], wordsOf: (path: string) => number, active: string | null, live: number | null): number {
  return items.reduce((sum, p) => sum + (p === active && live !== null ? live : wordsOf(p)), 0);
}
