import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { plainText } from '../editor/markdown';
import { type CookbookDocument, akaOf, cardFieldsOf, portraitOf } from '../storage/document';

export interface PeekTarget {
  path: string;
  rect: DOMRect;
}

interface Props {
  loadCard: (path: string) => Promise<CookbookDocument>;
  loadPicture: (path: string) => Promise<string>;
  onOpen: (path: string) => void;
}

const HOVER_MS = 350;
const LEAVE_MS = 250;
const LONG_PRESS_MS = 450;
const KIND_LABEL: Record<string, string> = { character: 'Character', setting: 'Setting', research: 'Research' };

/**
 * Peeks at a Pantry card from a linked name in the text: hover on a desktop,
 * press and hold on a touch screen. Cast chips open it with a click. It reads
 * the card from its file, so it is always current.
 */
export function NamePeek({ loadCard, loadPicture, onOpen }: Props) {
  const [target, setTarget] = useState<PeekTarget | null>(null);
  const [card, setCard] = useState<CookbookDocument | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fn, ms);
    };
    const show = (el: Element) => setTarget({ path: el.getAttribute('data-card')!, rect: el.getBoundingClientRect() });
    const nameAt = (e: Event) => (e.target instanceof Element ? e.target.closest('.cb-name[data-card]') : null);

    const over = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return window.clearTimeout(timer.current);
      const el = nameAt(e);
      if (el) later(() => show(el), HOVER_MS);
    };
    const out = (e: MouseEvent) => {
      if (nameAt(e) || box.current?.contains(e.target as Node)) later(() => setTarget(null), LEAVE_MS);
    };
    const click = (e: MouseEvent) => {
      const chip = e.target instanceof Element ? e.target.closest('[data-peek][data-card]') : null;
      if (chip) {
        window.clearTimeout(timer.current);
        show(chip);
      } else if (!box.current?.contains(e.target as Node)) setTarget(null);
    };
    let pressed: number | undefined;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const el = nameAt(e);
      if (el) pressed = window.setTimeout(() => show(el), LONG_PRESS_MS);
    };
    const cancelPress = () => window.clearTimeout(pressed);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setTarget(null);

    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('click', click);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', cancelPress);
    document.addEventListener('pointermove', cancelPress);
    document.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('click', click);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', cancelPress);
      document.removeEventListener('pointermove', cancelPress);
      document.removeEventListener('keydown', key);
    };
  }, []);

  // Read the card again only when the peek moves to another one.
  useEffect(() => {
    setCard(null);
    if (!target) return;
    let live = true;
    loadCard(target.path).then(
      (c) => live && setCard(c),
      () => live && setTarget(null),
    );
    return () => {
      live = false;
    };
  }, [target?.path, loadCard]);

  const portrait = card ? portraitOf(card.fields) : null;
  useEffect(() => {
    setPicture(null);
    if (!portrait) return;
    let url: string | null = null;
    let live = true;
    loadPicture(portrait).then((u) => (live ? setPicture((url = u)) : URL.revokeObjectURL(u)), () => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [portrait, loadPicture]);

  // Below the name, or above it when there is no room, and never off the side of the window.
  useLayoutEffect(() => {
    if (!target || !box.current) return setPos(null);
    const { width, height } = box.current.getBoundingClientRect();
    const r = target.rect;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const top = r.bottom + 8 + height > window.innerHeight - 12 ? Math.max(12, r.top - 8 - height) : r.bottom + 8;
    setPos({ left, top });
  }, [target, card, picture]);

  if (!target) return null;
  const fields = card ? cardFieldsOf(card.fields).filter(([, v]) => v.trim()).slice(0, 3) : [];
  const aka = card ? akaOf(card.fields) : [];
  const opening = card ? plainText(card.body).replace(/\s+/g, ' ').trim() : '';

  return (
    <div
      className="peek"
      role="dialog"
      aria-label={card ? card.title : 'Card'}
      ref={box}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setTarget(null), LEAVE_MS);
      }}
    >
      {card ? (
        <>
          <div className="peek-head">
            {picture && <img className="peek-picture" src={picture} alt="" />}
            <div>
              <span className="peek-kind">{KIND_LABEL[card.kind] ?? 'Card'}</span>
              <strong className="peek-title">{card.title}</strong>
              {aka.length > 0 && <span className="peek-aka">Also {aka.join(', ')}</span>}
            </div>
          </div>
          {fields.length > 0 && (
            <dl className="peek-fields">
              {fields.map(([k, v]) => (
                <div key={k}>
                  <dt>{k.charAt(0).toUpperCase() + k.slice(1)}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {opening && <p className="peek-text">{opening.length > 180 ? `${opening.slice(0, 180).trimEnd()}…` : opening}</p>}
          <div className="peek-actions">
            <button
              className="pill pill-accent"
              onClick={() => {
                setTarget(null);
                onOpen(target.path);
              }}
            >
              Open in Pantry
            </button>
          </div>
        </>
      ) : (
        <span className="peek-kind">Loading…</span>
      )}
    </div>
  );
}
