import { type ReactNode } from 'react';

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

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const BAR_ICONS = {
  /** A ticked box: pick everything. */
  selectAll: svg(
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>,
  ),
  /** Two stacked rows with a plus: a Group. */
  newGroup: svg(
    <>
      <path d="M4 7h9M4 12h6M4 17h6" />
      <path d="M17 11v8M13 15h8" />
    </>,
  ),
  /** A page with a plus: an Item. */
  newItem: svg(
    <>
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13 3v6h6M12 12v6M9 15h6" />
    </>,
  ),
  trash: svg(
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </>,
  ),
  /** On and off for every seasoning at once. */
  power: svg(
    <>
      <path d="M12 3v8" />
      <path d="M6.3 7a8 8 0 1 0 11.4 0" />
    </>,
  ),
  add: svg(<path d="M12 5v14M5 12h14" />),
  /** A minus: take the picked ones off. */
  remove: svg(<path d="M5 12h14" />),
};
