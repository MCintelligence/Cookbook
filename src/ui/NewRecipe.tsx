import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type BookInfo } from '../storage/book';
import {
  BUILT_IN_OUTLINES,
  type TemplateOutline,
  type TemplateShelf,
  type UserTemplate,
  deleteTemplateFiles,
  loadTemplates,
  outlineOf,
  saveTemplates,
} from '../storage/library';
import { type BookLocation, canPickFolder, openLocation } from '../storage/platform';
import { BOOK_TEMPLATES, type BookTemplateId } from '../storage/templates';
import { newId } from '../storage/document';
import { Menu, type MenuItem } from './Menu';

/** What the writer asked New Recipe for. */
export interface NewRecipeChoice {
  title: string;
  builtIn?: BookTemplateId;
  template?: UserTemplate;
  setup: Partial<Pick<BookInfo, 'series' | 'seriesNumber' | 'bookTarget'>>;
  inFolder: boolean;
}

interface Props {
  busy: boolean;
  error: string | null;
  current: BookLocation | null;
  currentTitle: string | null;
  defaultWhere: string;
  onCreate: (choice: NewRecipeChoice) => void;
  onSaveTemplate: (location: BookLocation, name: string, group: string, keepText: boolean) => Promise<UserTemplate>;
  onEditTemplate: (template: UserTemplate) => void;
  onBack: () => void;
  onClose: () => void;
}

type Picked = { builtIn: BookTemplateId } | { user: string };

const docIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 1.5h5.5L11 4v8.5H3z" />
    <path d="M8.5 1.5V4H11" />
  </svg>
);
const bookIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 2.5h3.5a1 1 0 0 1 1 1v8a1 1 0 0 0-1-1H2.5zM11.5 2.5H8a1 1 0 0 0-1 1v8a1 1 0 0 1 1-1h3.5z" />
  </svg>
);
const mineIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 1.5h7v11L7 10l-3.5 2.5z" />
  </svg>
);

const numberOf = (text: string) => {
  const n = Number(text.replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

/** A name the writer types in place: Enter or leaving the field keeps it, Escape keeps the old one. */
function InlineName({ value, label, onDone }: { value: string; label: string; onDone: (name: string | null) => void }) {
  return (
    <input
      className="tpl-rename"
      defaultValue={value}
      aria-label={label}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone(e.currentTarget.value.trim() || null);
        if (e.key === 'Escape') onDone(null);
      }}
      onBlur={(e) => onDone(e.currentTarget.value.trim() || null)}
    />
  );
}

/** New Recipe: templates down the left, built in and the writer's own in groups they make; what you get and the details on the right. */
export function NewRecipe({ busy, error, current, currentTitle, defaultWhere, onCreate, onSaveTemplate, onEditTemplate, onBack, onClose }: Props) {
  const [shelf, setShelfState] = useState<TemplateShelf>(loadTemplates);
  const [picked, setPicked] = useState<Picked>({ builtIn: 'novel' });
  const [title, setTitle] = useState('');
  const [series, setSeries] = useState('');
  const [seriesNumber, setSeriesNumber] = useState('');
  const [goal, setGoal] = useState('');
  const [inFolder, setInFolder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<{ label: string; x: number; y: number; items: MenuItem[] } | null>(null);
  const [outline, setOutline] = useState<TemplateOutline | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const outlines = useRef(new Map<string, TemplateOutline>());
  const titleField = useRef<HTMLInputElement>(null);

  const setShelf = (next: TemplateShelf) => {
    saveTemplates(next);
    setShelfState(next);
  };
  const user = 'user' in picked ? shelf.templates.find((t) => t.id === picked.user) : undefined;
  const builtIn = 'builtIn' in picked ? BOOK_TEMPLATES.find((t) => t.id === picked.builtIn)! : undefined;

  useEffect(() => titleField.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.menu') && renaming === null && !saving) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, renaming, saving]);

  // A template's outline is read only when it is picked, and kept for the rest of the visit.
  useEffect(() => {
    setConfirming(false);
    if (builtIn) return setOutline(BUILT_IN_OUTLINES[builtIn.id]);
    if (!user) return setOutline(null);
    const known = outlines.current.get(user.id);
    if (known) return setOutline(known);
    setOutline(null);
    let live = true;
    openLocation(user.location)
      .then(({ fs }) => outlineOf(fs))
      .then(
        (o) => {
          outlines.current.set(user.id, o);
          if (live) setOutline(o);
        },
        () => live && setProblem('Cookbook can’t read this template’s folder.'),
      );
    return () => {
      live = false;
    };
  }, [builtIn?.id, user?.id]);

  const addGroup = () => {
    const group = { id: newId(), name: 'New group' };
    setShelf({ ...shelf, groups: [...shelf.groups, group] });
    setRenaming(group.id);
  };
  const renameGroup = (id: string, name: string | null) => {
    setRenaming(null);
    if (name) setShelf({ ...shelf, groups: shelf.groups.map((g) => (g.id === id ? { ...g, name } : g)) });
  };
  const deleteGroup = (id: string) => {
    const rest = shelf.groups.filter((g) => g.id !== id);
    // Its templates move to the group above, so deleting a group never deletes a template.
    const to = (rest[Math.max(0, shelf.groups.findIndex((g) => g.id === id) - 1)] ?? rest[0])!;
    setShelf({ groups: rest, templates: shelf.templates.map((t) => (t.group === id ? { ...t, group: to.id } : t)) });
  };
  const changeTemplate = (id: string, changes: Partial<UserTemplate>) =>
    setShelf({ ...shelf, templates: shelf.templates.map((t) => (t.id === id ? { ...t, ...changes } : t)) });
  const deleteTemplate = async (t: UserTemplate) => {
    try {
      await deleteTemplateFiles(t);
    } catch {
      // A folder that is already gone needs no deleting.
    }
    setShelf({ ...shelf, templates: shelf.templates.filter((x) => x.id !== t.id) });
    setPicked({ builtIn: 'novel' });
  };

  const groupMenu = (id: string, x: number, y: number) =>
    setMenu({
      label: 'Template group',
      x,
      y,
      items: [
        { label: 'Rename group', onPick: () => setRenaming(id) },
        { label: 'New group', onPick: addGroup },
        { separator: true },
        shelf.groups.length > 1
          ? { label: 'Delete group', hint: 'Its templates move up', danger: true, onPick: () => deleteGroup(id) }
          : { label: 'Delete group', hint: 'The last group stays', disabled: true, onPick: () => {} },
      ],
    });
  const templateMenu = (t: UserTemplate, x: number, y: number) =>
    setMenu({
      label: t.name,
      x,
      y,
      items: [
        { label: 'Rename', hint: 'F2', onPick: () => setRenaming(t.id) },
        { label: 'Edit template', hint: 'Opens it', onPick: () => onEditTemplate(t), disabled: busy },
        { label: 'Move to', items: shelf.groups.map((g) => ({ label: g.name, checked: g.id === t.group, onPick: () => changeTemplate(t.id, { group: g.id }) })) },
        { separator: true },
        { label: 'Delete…', danger: true, onPick: () => (setPicked({ user: t.id }), setConfirming(true)) },
      ],
    });

  const navItem = (key: string, active: boolean, icon: ReactNode, name: ReactNode, pick: () => void, extra: Partial<React.HTMLAttributes<HTMLButtonElement>> = {}) => (
    <button key={key} type="button" className="recipes-nav-item" aria-current={active} onClick={pick} {...extra}>
      {icon}
      <span className="recipes-nav-label">{name}</span>
    </button>
  );

  const create = () => {
    const name = title.trim();
    if (!name || busy) return;
    onCreate({
      title: name,
      ...(builtIn ? { builtIn: builtIn.id } : { template: user }),
      setup: {
        ...(series.trim() && { series: series.trim() }),
        ...(numberOf(seriesNumber) && { seriesNumber: numberOf(seriesNumber) }),
        ...(numberOf(goal) && { bookTarget: numberOf(goal) }),
      },
      inFolder,
    });
  };

  const description = builtIn?.description ?? user?.description ?? '';
  const outlineList = (items: { name: string; className: string; depth?: number }[], none: string) => (
    <ul>
      {items.length === 0 ? (
        <li className="none">{none}</li>
      ) : (
        items.map((i, n) => (
          <li key={n} className={i.className} style={i.depth ? { paddingLeft: i.depth * 14 } : undefined}>
            {i.name}
          </li>
        ))
      )}
    </ul>
  );

  return (
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="lib new-recipe"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-title"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="recipes-head">
          <h2 id="new-title" className="panel-h">
            New Recipe
          </h2>
          <span className="recipes-spacer" />
          <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {(error || problem) && (
          <p role="alert" className="lib-error recipes-error">
            {error ?? problem}
          </p>
        )}
        <div className="new-body">
          <nav className="recipes-nav tpl-nav" aria-label="Templates">
            <div className="sub-h">Built in</div>
            {BOOK_TEMPLATES.map((t) =>
              navItem(t.id, builtIn?.id === t.id, t.id === 'empty' ? docIcon : bookIcon, t.name, () => setPicked({ builtIn: t.id })),
            )}
            {shelf.groups.map((g) => (
              <div key={g.id} className="tpl-group">
                <div
                  className="sub-h tpl-group-name"
                  title="Double-click to rename. Right-click for more."
                  onDoubleClick={() => setRenaming(g.id)}
                  onContextMenu={(e) => (e.preventDefault(), groupMenu(g.id, e.clientX, e.clientY))}
                >
                  {renaming === g.id ? <InlineName value={g.name} label="Group name" onDone={(n) => renameGroup(g.id, n)} /> : g.name}
                </div>
                {shelf.templates.filter((t) => t.group === g.id).length === 0 && <p className="tpl-empty">No templates yet</p>}
                {shelf.templates
                  .filter((t) => t.group === g.id)
                  .map((t) =>
                    navItem(
                      t.id,
                      user?.id === t.id,
                      mineIcon,
                      renaming === t.id ? <InlineName value={t.name} label="Template name" onDone={(n) => (setRenaming(null), n && changeTemplate(t.id, { name: n }))} /> : t.name,
                      () => setPicked({ user: t.id }),
                      {
                        onContextMenu: (e) => (e.preventDefault(), templateMenu(t, e.clientX, e.clientY)),
                        onKeyDown: (e) => {
                          if (e.key === 'F2') setRenaming(t.id);
                          if (e.key === 'Delete') (setPicked({ user: t.id }), setConfirming(true));
                        },
                        onDoubleClick: () => setRenaming(t.id),
                      },
                    ),
                  )}
              </div>
            ))}
            <button type="button" className="text-link tpl-link" onClick={addGroup}>
              + New group
            </button>
            {current && currentTitle && (
              <button type="button" className="text-link tpl-link" onClick={() => setSaving(true)}>
                + Save “{currentTitle}” as a template…
              </button>
            )}
          </nav>
          <div className="new-main">
            <div className="tpl-about">
              <div className="tpl-about-top">
                <span className="tpl-name">{builtIn?.name ?? user?.name}</span>
                {user && (
                  <span className="tpl-about-actions">
                    <button type="button" className="text-link" onClick={() => setRenaming(user.id)}>
                      Rename
                    </button>
                    <button type="button" className="text-link" onClick={() => onEditTemplate(user)} disabled={busy}>
                      Edit template
                    </button>
                    <button type="button" className="text-link tpl-danger" onClick={() => setConfirming(true)}>
                      Delete…
                    </button>
                  </span>
                )}
              </div>
              {user ? (
                <input
                  key={user.id}
                  className="tpl-desc-input"
                  defaultValue={description}
                  placeholder="Add a note about this template"
                  aria-label="Note about this template"
                  onBlur={(e) => e.currentTarget.value !== description && changeTemplate(user.id, { description: e.currentTarget.value.trim() || undefined })}
                />
              ) : (
                <p className="tpl-desc">{description}</p>
              )}
              {confirming && user && (
                <div className="tpl-confirm" role="alert">
                  <span>Delete “{user.name}”? The template’s files go too. Recipes made from it are kept.</span>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void deleteTemplate(user)}>
                    Delete
                  </button>
                </div>
              )}
              <div className="tpl-gets">
                <div>
                  <span className="sub-h">On the Shelf</span>
                  {outline ? outlineList(outline.shelf.map((s) => ({ name: s.name, className: s.group ? 'grp' : '', depth: s.depth })), 'Nothing yet') : <p className="tpl-empty">Reading…</p>}
                </div>
                <div>
                  <span className="sub-h">In the Pantry</span>
                  {outline ? outlineList(outline.pantry.map((p) => ({ name: p.name, className: p.kind })), 'Nothing yet') : null}
                </div>
              </div>
            </div>
            <label className="new-field">
              <span className="sub-h">Title</span>
              <input ref={titleField} className="new-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What’s it called?" />
            </label>
            <div className="new-row">
              <label className="new-field new-grow">
                <span className="sub-h">
                  Series <span className="new-optional">optional</span>
                </span>
                <input className="new-input" value={series} onChange={(e) => setSeries(e.target.value)} />
              </label>
              <label className="new-field new-small">
                <span className="sub-h">Book no.</span>
                <input className="new-input" inputMode="numeric" value={seriesNumber} onChange={(e) => setSeriesNumber(e.target.value)} />
              </label>
              <label className="new-field new-small">
                <span className="sub-h">Word goal</span>
                <input className="new-input" inputMode="numeric" value={goal} placeholder="e.g. 80,000" onChange={(e) => setGoal(e.target.value)} />
              </label>
            </div>
            <div className="new-field">
              <span className="sub-h">Where it’s kept</span>
              <div className="new-where">
                <span>{inFolder ? 'In a folder you choose when you press Create Recipe' : defaultWhere}</span>
                {canPickFolder() && (
                  <button type="button" className="text-link" onClick={() => setInFolder((v) => !v)}>
                    {inFolder ? 'Use the usual place' : 'Choose folder…'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="new-foot">
          <button type="button" className="text-link" onClick={onBack}>
            ← Your Recipes
          </button>
          <span className="lib-row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || busy || (!builtIn && !user)}>
              Create Recipe
            </button>
          </span>
        </div>
        {saving && current && currentTitle && (
          <SaveTemplate
            title={currentTitle}
            groups={shelf}
            onCancel={() => setSaving(false)}
            onSave={async (name, group, keepText) => {
              const t = await onSaveTemplate(current, name, group, keepText);
              setShelfState(loadTemplates());
              setPicked({ user: t.id });
              setSaving(false);
            }}
          />
        )}
        {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
      </form>
    </div>
  );
}

/** Saving a recipe as a template: its name, its group, and whether the Items keep their text. */
export function SaveTemplate({
  title,
  groups = loadTemplates(),
  onCancel,
  onSave,
}: {
  title: string;
  groups?: TemplateShelf;
  onCancel: () => void;
  onSave: (name: string, group: string, keepText: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(title);
  const [group, setGroup] = useState(groups.groups[0]!.id);
  const [keepText, setKeepText] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, working]);
  const save = async () => {
    if (!name.trim() || working) return;
    setWorking(true);
    setProblem(null);
    try {
      await onSave(name.trim(), group, keepText);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      setWorking(false);
    }
  };
  return (
    <div className="save-template" role="dialog" aria-modal="true" aria-labelledby="save-template-title" onSubmit={(e) => e.preventDefault()}>
      <h3 id="save-template-title" className="sub-h">
        Save “{title}” as a template
      </h3>
      <label className="new-field">
        <span className="new-label">Name</span>
        <input
          className="new-input"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
        />
      </label>
      <label className="new-field">
        <span className="new-label">Group</span>
        <select className="new-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label className="switch-row save-template-keep">
        <span>Keep the text of its Items</span>
        <input type="checkbox" className="switch" checked={keepText} onChange={(e) => setKeepText(e.target.checked)} />
      </label>
      <p className="save-template-note">Groups, Items, the Pantry, styles and goals are kept either way. Its history, snapshots and trash are not.</p>
      {problem && <p className="lib-error">{problem}</p>}
      <div className="lib-row">
        <button type="button" className="btn" onClick={onCancel} disabled={working}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!name.trim() || working}>
          {working ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
