import { type CSSProperties } from 'react';
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
 * What a card says: the name, the synopsis (written in place), and a line of where it stands.
 * `fit` is for a card whose shape fixes its size (an oval or a diamond): the footer goes, and the
 * label shows as a dot by the name. `titles` shows the name alone.
 */
export function CardFace({ host, item, pantry, ties, fit, titles }: CardProps & { fit?: boolean; titles?: boolean }) {
  const { card } = item;
  const tied = ties.get(card.id) ?? 0;
  const head = (
    <header>
      {pantry && <Face host={host} item={item} size={titles ? 22 : 26} />}
      {(fit || titles) && card.label && <LabelDot label={card.label} />}
      <h3>{card.title}</h3>
    </header>
  );
  if (titles) return head;
  return (
    <>
      {head}
      <Synopsis key={card.synopsis} value={card.synopsis} label={`Synopsis of ${card.title}`} placeholder={pantry ? 'Who or what, in a line' : 'What happens here?'} onSave={(text) => void host.setField(item.path, 'synopsis', text || undefined)} />
      {!fit && (
        <footer>
          {pantry ? (
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
