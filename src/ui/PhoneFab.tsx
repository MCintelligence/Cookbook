import { Icon } from './Icon';

/**
 * The round button in the bottom corner of the Shelf and the Pantry on a phone: the one way to
 * make something new there, where a thumb rests. `label` names what it makes, for a screen reader.
 */
export function PhoneFab({ label, onPick }: { label: string; onPick: (opener: HTMLElement) => void }) {
  return (
    <button type="button" className="phone-fab" aria-label={label} onClick={(e) => onPick(e.currentTarget)}>
      <Icon name="add" size={28} />
    </button>
  );
}
