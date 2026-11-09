/** Where an Item dragged from the Shelf onto the editor would go. */
export type DeskZone = 'left' | 'right' | 'open';

/** How wide each edge zone is: a share of the editor, kept between a floor and a ceiling. */
export const EDGE_SHARE = 0.22;
export const EDGE_MIN = 96;
export const EDGE_MAX = 240;

/**
 * The zone under (x, y) in the editor `box`: near the left or right edge the Item opens
 * beside the page, anywhere else it opens in place of it. null outside the editor. With
 * `split` false (nothing open, or Mise en Place showing) the whole editor just opens it.
 */
export function deskZone(box: { left: number; right: number; top: number; bottom: number }, x: number, y: number, split: boolean): DeskZone | null {
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
  if (!split) return 'open';
  const edge = edgeWidth(box.right - box.left);
  if (x < box.left + edge) return 'left';
  if (x > box.right - edge) return 'right';
  return 'open';
}

/** The width of each edge zone in an editor `width` wide. */
export function edgeWidth(width: number): number {
  return Math.min(EDGE_MAX, Math.max(EDGE_MIN, width * EDGE_SHARE));
}
