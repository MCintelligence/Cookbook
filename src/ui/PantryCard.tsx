import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { type CookbookDocument, type Relationship, akaOf, cardFieldsOf, portraitOf, relationshipsOf } from '../storage/document';
import { type IncomingRelationship, type SceneMention } from '../storage/index';

export interface CardChoice {
  id: string;
  title: string;
  path: string;
}

interface Props {
  doc: CookbookDocument;
  /** Other Pantry cards a relationship can point at. */
  choices: CardChoice[];
  /** Relationships other cards have with this one. */
  incoming: IncomingRelationship[];
  /** Scenes that name this card, in Bookshelf order; null for cards that can't be named. */
  appearsIn: SceneMention[] | null;
  loadPicture: (path: string) => Promise<string>;
  onChange: (doc: CookbookDocument) => void;
  onPickPortrait: (file: File) => void;
  onOpen: (path: string) => void;
  /** Its width, the same as the page below. */
  style?: CSSProperties;
}

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The top of a character, setting or research card: portrait, other names,
 * the writer's own fields and relationships. The free writing is the page
 * below, in the same editor as a scene.
 */
export function PantryCard({ doc, choices, incoming, appearsIn, loadPicture, onChange, onPickPortrait, onOpen, style }: Props) {
  const fields = cardFieldsOf(doc.fields);
  const relationships = relationshipsOf(doc.fields);
  const portrait = portraitOf(doc.fields);
  const isResearch = doc.kind === 'research';
  const [aka, setAka] = useState(akaOf(doc.fields).join(', '));
  const [picture, setPicture] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const byId = new Map(choices.map((c) => [c.id, c]));

  // Reset the nicknames box only when another card opens, not while typing in it.
  useEffect(() => setAka(akaOf(doc.fields).join(', ')), [doc.id]);

  useEffect(() => {
    if (!portrait) return setPicture(null);
    let url: string | null = null;
    let live = true;
    loadPicture(portrait).then(
      (u) => (live ? setPicture((url = u)) : URL.revokeObjectURL(u)),
      () => live && setPicture(null),
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [portrait, loadPicture]);

  const setFields = (entries: [string, string][]) => {
    const kept = Object.entries(doc.fields).filter(([key]) => !fields.some(([k]) => k === key));
    onChange({ ...doc, fields: Object.fromEntries([...entries, ...kept]) });
  };
  const setField = (i: number, key: string, value: string) => setFields(fields.map((f, j) => (j === i ? [key, value] : f)));
  const addField = () => {
    let name = 'new field';
    for (let n = 2; fields.some(([k]) => k === name); n++) name = `new field ${n}`;
    setFields([...fields, [name, '']]);
  };
  const setOwn = (key: string, value: unknown) => {
    const { [key]: _old, ...rest } = doc.fields;
    const empty = value === undefined || (Array.isArray(value) && value.length === 0);
    onChange({ ...doc, fields: empty ? rest : { ...rest, [key]: value } });
  };
  const setRelationships = (list: Relationship[]) => setOwn('relationships', list.length > 0 ? list : undefined);
  const commitAka = () => setOwn('aka', aka.split(',').map((s) => s.trim()).filter(Boolean));

  return (
    <section className="pantry-card" aria-label="Card details" style={style}>
      {!isResearch && (
        <div className="pc-portrait">
          <button className="pc-picture" aria-label={portrait ? 'Change portrait' : 'Add a portrait'} onClick={() => filePicker.current?.click()}>
            {picture ? <img src={picture} alt="" /> : <span>Add a portrait</span>}
          </button>
          {portrait && (
            <button className="pc-remove" onClick={() => setOwn('portrait', undefined)}>
              Remove
            </button>
          )}
          <input
            ref={filePicker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickPortrait(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
      <div className="pc-main">
        <input className="pc-name" aria-label="Card name" value={doc.title} onChange={(e) => onChange({ ...doc, title: e.target.value })} />
        {!isResearch && (
          <label className="pc-row">
            <span className="pc-key">Also known as</span>
            <input
              className="pc-value"
              value={aka}
              placeholder="Nicknames, separated by commas"
              onChange={(e) => setAka(e.target.value)}
              onBlur={commitAka}
              onKeyDown={(e) => e.key === 'Enter' && commitAka()}
            />
          </label>
        )}
        {fields.map(([key, value], i) => (
          <div className="pc-row" key={i}>
            <input className="pc-key" aria-label="Field name" value={label(key)} onChange={(e) => setField(i, e.target.value.toLowerCase(), value)} />
            <input className="pc-value" aria-label={label(key)} value={value} onChange={(e) => setField(i, key, e.target.value)} />
            <button className="pc-x" aria-label={`Remove ${key}`} onClick={() => setFields(fields.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button className="ghost pc-add" onClick={addField}>
          + Field
        </button>

        {!isResearch && (
          <div className="pc-relations">
            <span className="pc-heading">Relationships</span>
            {relationships.map((r, i) => (
              <div className="pc-row" key={i}>
                <input
                  className="pc-key"
                  aria-label="Relationship"
                  placeholder="Mother of"
                  value={r.as}
                  onChange={(e) => setRelationships(relationships.map((x, j) => (j === i ? { ...x, as: e.target.value } : x)))}
                />
                <select
                  className="pc-value"
                  aria-label="Who"
                  value={r.to}
                  onChange={(e) => setRelationships(relationships.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))}
                >
                  <option value="">Choose a card…</option>
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                  {r.to && !byId.has(r.to) && <option value={r.to}>A card that is gone</option>}
                </select>
                <button className="pc-x" aria-label="Remove relationship" onClick={() => setRelationships(relationships.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            {incoming.map((r) => (
              <div className="pc-row pc-incoming" key={`${r.path}-${r.as}`}>
                <button className="pc-link" onClick={() => onOpen(r.path)}>
                  {r.title}
                </button>
                <span>
                  {r.as || 'Linked'} {doc.title}
                </span>
              </div>
            ))}
            <button className="ghost pc-add" onClick={() => setRelationships([...relationships, { to: '', as: '' }])}>
              + Relationship
            </button>
          </div>
        )}

        {appearsIn && (
          <div className="pc-relations">
            <span className="pc-heading">Appears in</span>
            {appearsIn.length === 0 && <span className="pc-quiet">No page names {doc.title} yet.</span>}
            {appearsIn.map((m) => (
              <div className="pc-row pc-incoming" key={m.path}>
                <button className="pc-link" onClick={() => onOpen(m.path)}>
                  {m.title}
                </button>
                <span>{m.count === 1 ? 'once' : `${m.count} times`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
