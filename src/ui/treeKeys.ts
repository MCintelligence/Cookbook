import { type TreeNode } from '../storage/book';

/** Where a row sits: the folder holding it, its place there, and what else is there. */
export interface Place {
  parent: string;
  index: number;
  siblings: TreeNode[];
}

/** Every row's place, worked out once each time the tree changes (not on every render). */
export function placesOf(nodes: TreeNode[], root: string): Map<string, Place> {
  const places = new Map<string, Place>();
  const walk = (list: TreeNode[], parent: string) =>
    list.forEach((n, index) => {
      places.set(n.path, { parent, index, siblings: list });
      if (n.children) walk(n.children, n.path);
    });
  walk(nodes, root);
  return places;
}

/** The rows on screen, in order: folders that are closed hide what they hold. */
export function shownPaths(nodes: TreeNode[], collapsed: Set<string>): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]) =>
    list.forEach((n) => {
      out.push(n.path);
      if (n.kind === 'folder' && !collapsed.has(n.path) && n.children) walk(n.children);
    });
  walk(nodes);
  return out;
}

/** A move, in the terms Tree's onMove takes: `index` among what `folder` holds now. */
export interface Move {
  folder: string;
  index: number;
}

/**
 * Where Alt+↑ or Alt+↓ takes a row. Inside its Group it swaps with its
 * neighbour. An item at the edge of its Group carries on into the Group next
 * to it (to its end going up, its start going down), or out beside its Group
 * when there is none. Groups only reorder, so one never lands inside another
 * by accident. Null when it can go no further.
 */
export function altMove(node: TreeNode, places: Map<string, Place>, root: string, dir: -1 | 1): Move | null {
  const at = places.get(node.path);
  if (!at) return null;
  const { parent, index, siblings } = at;
  // onMove counts the row itself while it is still in its folder, hence +2 going down.
  if (dir < 0 && index > 0) return { folder: parent, index: index - 1 };
  if (dir > 0 && index < siblings.length - 1) return { folder: parent, index: index + 2 };
  if (node.kind === 'folder' || parent === root) return null;
  const group = places.get(parent);
  if (!group) return null;
  const neighbour = group.siblings[group.index + dir];
  if (neighbour?.kind === 'folder') return { folder: neighbour.path, index: dir < 0 ? (neighbour.children?.length ?? 0) : 0 };
  return { folder: group.parent, index: dir < 0 ? group.index : group.index + 1 };
}

/**
 * Where Mod+V puts a cut row: into a Group at its end, or after an item in its
 * Group. Null when that would put a Group inside itself, or nowhere has changed.
 */
export function pasteMove(cut: string, onto: TreeNode, places: Map<string, Place>): Move | null {
  if (onto.path === cut || onto.path.startsWith(cut + '/')) return null;
  if (onto.kind === 'folder') return { folder: onto.path, index: onto.children?.length ?? 0 };
  const at = places.get(onto.path);
  if (!at) return null;
  // Just after it, counting as onMove does (the cut row still in place), as Alt+↓ does.
  return { folder: at.parent, index: at.index + 1 };
}
