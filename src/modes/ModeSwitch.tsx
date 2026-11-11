import { type ReactNode } from 'react';
import { keysFor } from '../shortcuts';
import { type MenuItem } from '../ui/Menu';
import { useStore } from '../ui/store';
import { MODES, type Mode, type Side, modeStore, sideOf } from './prefs';

const svg = (children: ReactNode, size = 16) => (
  <svg className="mode-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/** A pot on the stove for Cook, a chopping board and knife for Prep, a calendar page for Plan. */
export function ModeIcon({ mode, size }: { mode: Mode; size?: number }) {
  if (mode === 'cook')
    return svg(
      <>
        <path d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
        <path d="M2.5 12.5H5M19 12.5h2.5M4 8h16" />
        <path d="M12 8V6.2" />
      </>,
      size,
    );
  if (mode === 'prep')
    return svg(
      <>
        <rect x="3" y="7" width="13.5" height="12" rx="2" />
        <circle cx="6.4" cy="10.4" r="0.6" />
        <path d="M20 4.5v9.2c-1.7-.5-2.6-2-2.6-4.4 0-2.2.9-3.9 2.6-4.8z" />
        <path d="M20 13.7V19" />
      </>,
      size,
    );
  return svg(
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="M8.5 14h2M13.5 14h2M8.5 17h2" />
    </>,
    size,
  );
}

/** Leaves a view for another: the same thing every way of switching does. */
export function goToMode(mode: Mode): void {
  modeStore.set(mode);
}

/** The modes as a menu's items, for the top bar's switch and the View menu. */
export function modeItems(side: Side): MenuItem[] {
  const mode = modeStore.get();
  return MODES.map((m) => ({ label: m.name, hint: [m.hint[side], keysFor(m.shortcut)].filter(Boolean).join('   '), icon: <ModeIcon mode={m.id} />, checked: m.id === mode, onPick: () => goToMode(m.id) }));
}

interface Props {
  /** The open file's name, or null when nothing is open. */
  title: string | null;
  openIsCard: boolean;
  showMenu(label: string, x: number, y: number, items: MenuItem[], opener: HTMLElement): void;
  expanded: boolean;
}

/**
 * The open Item's name in the top bar, which is also the switch between Cook, Prep and Plan:
 * the picture before the name is the mode that is on, and a click lists all three.
 */
export function ModeSwitch({ title, openIsCard, showMenu, expanded }: Props) {
  const mode = useStore(modeStore);
  const side = sideOf(openIsCard);
  const name = MODES.find((m) => m.id === mode)!.name;
  return (
    <button
      className="crumb-mode"
      aria-haspopup="menu"
      aria-expanded={expanded}
      aria-label={`${name} mode${title ? `, ${title}` : ''}. Change mode`}
      title={`${name}: ${MODES.find((m) => m.id === mode)!.hint[side].toLowerCase()}`}
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        showMenu('Mode', box.left, box.bottom + 4, modeItems(side), e.currentTarget);
      }}
    >
      <ModeIcon mode={mode} />
      <span className="crumb-mode-name">{title ?? name}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
