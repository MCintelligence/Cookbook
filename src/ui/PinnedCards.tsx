import { useEffect, useState } from 'react';
import { type CookbookDocument } from '../storage/document';
import { CardPreview } from './CardPreview';

interface Props {
  paths: string[];
  /** Changes whenever the book's files do, so pinned cards stay current. */
  version: number;
  loadCard: (path: string) => Promise<CookbookDocument>;
  loadPicture: (path: string) => Promise<string>;
  onUnpin: (path: string) => void;
  onOpen: (path: string) => void;
  onMenu?: (path: string, x: number, y: number) => void;
}

/** Cards pinned beside the page, in the right-hand drawer, to keep a character in view while writing. */
export function PinnedCards({ paths, version, loadCard, loadPicture, onUnpin, onOpen, onMenu }: Props) {
  return (
    <section className="pins" aria-label="Pinned cards">
      {paths.map((p) => (
        <Pinned key={p} path={p} version={version} loadCard={loadCard} loadPicture={loadPicture} onUnpin={onUnpin} onOpen={onOpen} onMenu={onMenu} />
      ))}
    </section>
  );
}

function Pinned({ path, version, loadCard, loadPicture, onUnpin, onOpen, onMenu }: Omit<Props, 'paths'> & { path: string }) {
  const [card, setCard] = useState<CookbookDocument | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let live = true;
    loadCard(path).then(
      (c) => live && (setCard(c), setGone(false)),
      () => live && setGone(true),
    );
    return () => {
      live = false;
    };
  }, [path, version, loadCard]);

  return (
    <article
      className="pin"
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(path, e.clientX, e.clientY);
      }}
    >
      <div className="pin-bar">
        <span className="pin-label">Pinned</span>
        {card && (
          <button className="pin-open" onClick={() => onOpen(path)}>
            Open
          </button>
        )}
        <button className="pin-close" aria-label={`Unpin ${card?.title ?? 'card'}`} onClick={() => onUnpin(path)}>
          ×
        </button>
      </div>
      {gone ? <p className="peek-text">This card has moved or been deleted.</p> : card && <CardPreview card={card} loadPicture={loadPicture} full />}
    </article>
  );
}
