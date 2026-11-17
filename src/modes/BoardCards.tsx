import { type CSSProperties, useEffect, useRef } from 'react';
import { STATUSES } from '../storage/document';
import { type PantrySection } from '../storage/pantry';
import { type MenuItem } from '../ui/Menu';
import { StatusIcon } from '../ui/StatusIcon';
import { type Form, type ModeHost } from './host';
import { type Item, labelColor } from './model';
import { Face, LabelDot, Synopsis, cardMenu, itemMenu, shortWhen } from './shared';

/** What both boards, grid and free, show on a card and offer when it is right-clicked. */
export interface CardProps {
  host: ModeHost;
  ask(form: Form): void;
  item: Item;
  pantry: boolean;
  ties: Map<string, number>;
}

export const SINGULAR: Record<PantrySection, string> = { characters: 'Character', settings: 'Setting', research: 'Material' };
export const sectionOfGroup = (group: string) => group.slice('pantry/'.length) as PantrySection;

export function menuOf({ host, ask, item, pantry }: CardProps, extra: MenuItem[] = []): MenuItem[] {
  const menu = pantry ? cardMenu(host, item) : itemMenu(host, item, ask);
  if (extra.length === 0) return menu;
  // The board's own choices go in before Rename and Remove, which stay last.
  const at = menu.findIndex((m) => 'label' in m && m.label === 'Rename');
  return [...menu.slice(0, at), ...extra, ...menu.slice(at)];
}

/**
 * What the free board adds to a card: its name typed in place (`renaming`, ended by `onRetitle`
 * with the new name, or null to keep the old one), and for a card that lives only on the board,
 * where its words are kept (`note`).
 */
export interface FaceExtras {
  fit?: boolean;
  titles?: boolean;
  renaming?: boolean;
  onRetitle?(title: string | null): void;
  note?: { onText(text: string): void };
}

/**
 * What a card says: the name, the synopsis (written in place), and a line of where it stands.
 * `fit` is for a card whose shape fixes its size (an oval or a diamond): the footer goes, and the
 * label shows as a dot by the name. `titles` shows the name alone.
 */
export function CardFace({ host, item, pantry, ties, fit, titles, renaming, onRetitle, note }: CardProps & FaceExtras) {
  const { card } = item;
  const tied = ties.get(card.id) ?? 0;
  const head = (
    <header>
      {pantry && !note && <Face host={host} item={item} size={titles ? 22 : 26} />}
      {(fit || titles) && card.label && <LabelDot label={card.label} />}
      {renaming && onRetitle ? <TitleBox value={card.title} onDone={onRetitle} /> : <h3 title={onRetitle ? 'Click to rename' : undefined}>{card.title}</h3>}
    </header>
  );
  if (titles) return head;
  return (
    <>
      {head}
      <Synopsis
        key={card.synopsis}
        value={card.synopsis}
        label={`Synopsis of ${card.title}`}
        placeholder={note ? 'A few words' : pantry ? 'Who or what, in a line' : 'What happens here?'}
        onSave={(text) => (note ? note.onText(text) : void host.setField(item.path, 'synopsis', text || undefined))}
      />
      {!fit && (
        <footer>
          {note ? (
            <span className="prep-card-note">On this board only</span>
          ) : pantry ? (
            <span>{[tied > 0 ? `${tied} ${tied === 1 ? 'tie' : 'ties'}` : '', card.dates.length > 0 ? `${card.dates.length} ${card.dates.length === 1 ? 'date' : 'dates'}` : ''].filter(Boolean).join(' · ') || ' '}</span>
          ) : (
            <>
              <span className="prep-card-status">
                <StatusIcon status={card.status} decorative /> {STATUSES.find((s) => s.id === card.status)!.label}
              </span>
              <span>{card.dates[0] ? shortWhen(card.dates[0]) : `${card.words.toLocaleString('en')} words`}</span>
            </>
          )}
        </footer>
      )}
    </>
  );
}

export const cardStyle = (item: Item): CSSProperties => ({ '--label': labelColor(item.card.label) ?? 'transparent' }) as CSSProperties;

/** A card's name, typed in place: Enter or a click away keeps it, Escape puts the old one back. */
function TitleBox({ value, onDone }: { value: string; onDone(title: string | null): void }) {
  const box = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  return (
    <input
      ref={box}
      className="card-title-box"
      aria-label="Name"
      defaultValue={value}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
