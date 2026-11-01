import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { type CookbookDocument, type Relationship, akaOf, cardFieldKeys, cardFieldsOf, portraitOf, relationshipsOf, withCardFields } from '../storage/document';
import { type IncomingRelationship, type SceneMention } from '../storage/index';
import { FIELD_PLACEHOLDERS, fieldPlaceholder, isBrainstormKind } from '../storage/brainstorm';

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

/** One of the writer's fields as it stands on screen, with an id of its own so typing never moves it. */
interface FieldRow {
  id: number;
  name: string;
  value: string;
}

let nextRowId = 1;
const rowsOf = (doc: CookbookDocument): FieldRow[] => cardFieldsOf(doc).map(([key, value]) => ({ id: nextRowId++, name: label(key), value }));

/**
 * The top of a character, setting or research card: portrait, other names,
 * the writer's own fields and relationships. The free writing is the page
 * below, in the same editor as a scene.
 */
export function PantryCard({ doc, choices, incoming, appearsIn, loadPicture, onChange, onPickPortrait, onOpen, style }: Props) {
  const relationships = relationshipsOf(doc.fields);
  const portrait = portraitOf(doc.fields);
  const isResearch = doc.kind === 'research';
  const [aka, setAka] = useState(akaOf(doc.fields).join(', '));
  const [picture, setPicture] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const byId = new Map(choices.map((c) => [c.id, c]));

  // The fields are kept as typed while the card is open, so a name that is blank, repeated or
  // one Cookbook keeps for itself never makes a field jump, merge with another or vanish.
  const [rows, setRows] = useState<FieldRow[]>(() => rowsOf(doc));
  const rowList = useRef<HTMLDivElement>(null);

  // Reset the nicknames box and the fields only when another card opens, not while typing in them.
  useEffect(() => {
    setAka(akaOf(doc.fields).join(', '));
    setRows(rowsOf(doc));
  }, [doc.id]);

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

  /** Shows the fields as they are now and saves them, each under a name no other key has. */
  const saveRows = (next: FieldRow[]) => {
    setRows(next);
    // A row with neither a name nor a value is still being made; it isn't saved yet.
    const kept = next.filter((r) => r.name.trim() || r.value.trim());
    const keys = cardFieldKeys(kept.map((r) => r.name));
    onChange(withCardFields(doc, kept.map((r, i) => [keys[i]!, r.value])));
  };
  const editRow = (id: number, change: Partial<FieldRow>) => saveRows(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  // A new field starts with no name, so the writer types one from scratch; it is saved once it has a name or a value.
  const addField = () => {
    setRows([...rows, { id: nextRowId++, name: '', value: '' }]);
    requestAnimationFrame(() => rowList.current?.querySelector<HTMLInputElement>('.pc-row:last-child .pc-key')?.focus());
  };
  /** Enter in a field moves to the next one's value, like a form. */
  const onFieldKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const inputs = [...(rowList.current?.querySelectorAll<HTMLInputElement>('.pc-value') ?? [])];
    const at = e.currentTarget.classList.contains('pc-value') ? inputs.indexOf(e.currentTarget) + 1 : inputs.indexOf(e.currentTarget.parentElement!.querySelector('.pc-value')!);
    inputs[at]?.focus();
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
              placeholder={isBrainstormKind(doc.kind) ? FIELD_PLACEHOLDERS[doc.kind].aka : 'Nicknames, separated by commas'}
              onChange={(e) => setAka(e.target.value)}
              onBlur={commitAka}
              onKeyDown={(e) => e.key === 'Enter' && commitAka()}
            />
          </label>
        )}
        <div className="pc-fields" ref={rowList}>
          {rows.map((r) => (
            <div className="pc-row" key={r.id}>
              <input className="pc-key" aria-label="Field name" placeholder="Field name" value={r.name} onChange={(e) => editRow(r.id, { name: e.target.value })} onKeyDown={onFieldKey} />
              <input className="pc-value" aria-label={r.name.trim() || 'Field'} placeholder={fieldPlaceholder(doc.kind, r.name)} value={r.value} onChange={(e) => editRow(r.id, { value: e.target.value })} onKeyDown={onFieldKey} />
              <button className="pc-x" aria-label={`Remove ${r.name.trim() || 'field'}`} onClick={() => saveRows(rows.filter((x) => x.id !== r.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
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
            {appearsIn.length === 0 && <span className="pc-quiet">No item names {doc.title} yet.</span>}
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
