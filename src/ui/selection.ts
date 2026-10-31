import { type TreeNode } from '../storage/book';

/** Every Group and Item in a tree, in Shelf order. */
export function allPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) =>
    list.forEach((n) => {
      out.push(n.path);
      walk(n.children ?? []);
    });
  walk(nodes);
  return out;
}

/** The selection without anything inside a selected Group: deleting or moving the Group takes those along. */
export function topmost(paths: Iterable<string>): string[] {
  const list = [...paths];
  return list.filter((p) => !list.some((q) => q !== p && p.startsWith(q + '/')));
}

/** The selection with only the paths still in the tree, the same Set when nothing went. */
export function stillThere(marked: Set<string>, nodes: TreeNode[]): Set<string> {
  if (marked.size === 0) return marked;
  const there = new Set(allPaths(nodes));
  const kept = [...marked].filter((p) => there.has(p));
  return kept.length === marked.size ? marked : new Set(kept);
}

/** Shift-click: every row shown from the anchor to the one clicked, both included. */
export function between(shown: string[], anchor: string | null, to: string): string[] {
  const a = anchor ? shown.indexOf(anchor) : -1;
  const b = shown.indexOf(to);
  if (b === -1) return [];
  if (a === -1) return [to];
  return shown.slice(Math.min(a, b), Math.max(a, b) + 1);
}
