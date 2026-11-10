import { type ReactNode } from 'react';
import { Icon } from './Icon';
import { type IconName } from './iconArt';

export interface BarButton {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** A toggle: shown pressed while on. */
  pressed?: boolean;
  danger?: boolean;
  /** Pushed to the far end of the bar. */
  end?: boolean;
}

/** The small row of icon buttons at the foot of the Shelf, the Pantry and Seasonings. */
export function PanelBar({ label, buttons, status }: { label: string; buttons: BarButton[]; status?: string }) {
  const at = buttons.findIndex((b) => b.end);
  const start = at === -1 ? buttons : buttons.slice(0, at);
  const end = at === -1 ? [] : buttons.slice(at);
  const button = (b: BarButton) => (
    <button
      key={b.label}
      className={`bar-btn${b.danger ? ' bar-danger' : ''}`}
      aria-label={b.label}
      title={b.label}
      aria-pressed={b.pressed}
      disabled={b.disabled}
      onClick={b.onClick}
    >
      {b.icon}
    </button>
  );
  return (
    <div className="panel-bar" role="toolbar" aria-label={label}>
      {start.map(button)}
      <span className="bar-status" aria-live="polite">
        {status}
      </span>
      {end.map(button)}
    </div>
  );
}

const icon = (name: IconName) => <Icon name={name} size={16} />;

export const BAR_ICONS = {
  /** A ticked box: pick everything. */
  selectAll: icon('selectAll'),
  /** Rows with a plus: a Group. */
  newGroup: icon('newGroup'),
  /** A page with a plus: an Item. */
  newItem: icon('newItem'),
  trash: icon('trash'),
  /** On and off for every seasoning at once. */
  power: icon('power'),
  add: icon('add'),
  /** A minus: take the picked ones off. */
  remove: icon('remove'),
};
