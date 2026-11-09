import { type DeskZone, edgeWidth } from './deskDrop';

const LABELS: Record<DeskZone, string> = { left: 'Open on the left', right: 'Open on the right', open: 'Open here' };

/** While a Shelf Item is dragged over the editor: the zone it would land in, and what happens there. */
export function DeskDropHint({ zone, box }: { zone: DeskZone; box: DOMRect | null }) {
  if (!box) return null;
  const edge = edgeWidth(box.width);
  const left = zone === 'right' ? box.right - edge : box.left;
  const width = zone === 'open' ? box.width : edge;
  return (
    <div className={`desk-drop-hint ${zone}`} style={{ left, top: box.top, width, height: box.height }} aria-hidden="true">
      <span>{LABELS[zone]}</span>
    </div>
  );
}
