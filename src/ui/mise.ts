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

/** Whether `path` is inside the Group `group`, at any depth. */
export const isInside = (path: string, group: string): boolean => path.startsWith(group + '/');

/** The Group's own name, then everything inside it in Shelf order: Groups as dividers, Items as pages. */
export function miseEntries(group: TreeNode): MiseEntry[] {
  const out: MiseEntry[] = [{ type: 'group', path: group.path, name: group.name, depth: 0 }];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const n of nodes) {
      if (n.kind === 'file') out.push({ type: 'item', path: n.path, name: n.name.replace(/\.md$/, '') });
      else {
        out.push({ type: 'group', path: n.path, name: n.name, depth });
        walk(n.children ?? [], depth + 1);
      }
    }
  };
  walk(group.children ?? [], 1);
  return out;
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
