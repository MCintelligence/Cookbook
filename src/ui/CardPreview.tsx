import { useEffect, useState } from 'react';
import { plainText } from '../editor/markdown';
import { type CookbookDocument, akaOf, cardFieldsOf, portraitOf } from '../storage/document';

const KIND_LABEL: Record<string, string> = { character: 'Character', setting: 'Place', research: 'Research', scene: 'Chapter' };

/** A blob URL for a picture in the book, released when it is no longer shown. */
export function usePicture(path: string | null, load: (path: string) => Promise<string>): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!path) return;
    let made: string | null = null;
    let live = true;
    load(path).then((u) => (live ? setUrl((made = u)) : URL.revokeObjectURL(u)), () => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [path, load]);
  return url;
}

/**
 * A Pantry card at a glance: picture, names, fields and the start of its
 * writing. `full` shows every field and more of the text, for a pinned card.
 */
export function CardPreview({ card, loadPicture, full = false }: { card: CookbookDocument; loadPicture: (path: string) => Promise<string>; full?: boolean }) {
  const picture = usePicture(portraitOf(card.fields), loadPicture);
  const fields = cardFieldsOf(card.fields).filter(([, v]) => v.trim());
  const aka = akaOf(card.fields);
  const text = plainText(card.body).replace(/\s+/g, ' ').trim();
  const limit = full ? 900 : 180;
  return (
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
          {(full ? fields : fields.slice(0, 3)).map(([k, v]) => (
            <div key={k}>
              <dt>{k.charAt(0).toUpperCase() + k.slice(1)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {text && <p className="peek-text">{text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text}</p>}
    </>
  );
}
