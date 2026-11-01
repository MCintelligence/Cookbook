import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type StorageAdapter } from '../storage/adapter';
import { type TreeNode } from '../storage/book';
import { type Chapter, readChapters } from '../plate/book';
import { type Page, PaginateCancelled, geometry, markFirst, openerHtml, pageCss, pageHtml, paginate, plateCss, printBookHtml } from '../plate/layout';
import { plateEpub } from '../plate/epub';
import {
  BACK_LABELS,
  FRONT_LABELS,
  type BackId,
  type FrontId,
  type Matter,
  OPENERS,
  type OpenerId,
  PLATE_FONTS,
  type PlateSettings,
  SCENE_BREAKS,
  TEMPLATES,
  type TemplateId,
  TRIMS,
  type TrimId,
  defaultCopyright,
  orderChapters,
  withTemplate,
} from '../plate/settings';
import { printHtml } from '../export/print';
import { KINDS, saveFile } from './saveFile';

interface Props {
  fs: StorageAdapter;
  title: string;
  /** The Bookshelf, in order. */
  shelf: TreeNode[];
  settings: PlateSettings;
  onChange: (next: PlateSettings) => void;
  /** The book's id, made the first time it's needed, so readers know a new e-book is the same book. */
  bookId: () => Promise<string>;
  onClose: () => void;
  say: (text: string) => void;
  onError: (text: string) => void;
}

type Row = { section: 'front'; id: FrontId } | { section: 'chapter'; id: string } | { section: 'back'; id: BackId };

const sameRow = (a: Row | null, b: Row) => !!a && a.section === b.section && a.id === b.id;

/** Moves an entry of a list to where another one is. */
function moveTo<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * Plate mode: the book as it will be served. The Book panel picks and orders
 * what goes in, the middle shows the pages as they'll print (or the e-book as
 * it reads), and the Style panel sets the type. Settings save as they change.
 */
export function Plate({ fs, title, shelf, settings: s, onChange, bookId, onClose, say, onError }: Props) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  // Pages are being set from the start: first the chapters are gathered, then laid out.
  const [setting, setSetting] = useState(true);
  /** Pages set so far while the layout runs, for the footer. */
  const [settingAt, setSettingAt] = useState(0);
  const [view, setView] = useState<'print' | 'ebook'>('print');
  const [spread, setSpread] = useState(0);
  const [picked, setPicked] = useState<Row | null>(null);
  const [margins, setMargins] = useState(false);
  const [serveOpen, setServeOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 900, height: 700 });
  const g = geometry(s);

  useEffect(() => {
    let live = true;
    readChapters(fs, shelf).then(
      (all) => live && setChapters(all),
      (e: unknown) => onError(`Couldn’t gather the book. ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [fs, shelf]);

  const ordered = useMemo(() => (chapters ? orderChapters(chapters, s.chapterOrder) : []), [chapters, s.chapterOrder]);
  const included = useMemo(() => ordered.filter((c) => !s.skipped.includes(c.path)), [ordered, s.skipped]);
  const book = useMemo(() => ({ title, chapters: included }), [title, included]);

  // Only what changes the pages sets them again; the text boxes wait until typing pauses.
  const layoutKey = JSON.stringify([s.trim, s.font, s.size, s.lineHeight, s.opener, s.dropCap, s.sceneBreak, s.rectoStarts, s.pageNumbers, s.front, s.back, s.subtitle, s.author, s.copyright, s.dedication, s.acknowledgements, s.about, included.map((c) => c.path)]);
  useEffect(() => {
    if (!chapters || !host.current) return;
    let live = true;
    setSetting(true);
    setSettingAt(0);
    const timer = setTimeout(() => {
      const fonts = document.fonts;
      const ready = fonts
        ? Promise.all([fonts.load(`${s.size}pt "${s.font}"`), fonts.load(`italic ${s.size}pt "${s.font}"`)]).catch(() => [])
        : Promise.resolve([]);
      void ready.then(async () => {
        if (!live || !host.current) return;
        try {
          // Set in short slices, so the window stays usable on a long book; a newer layout or closing Plate calls it off.
          const next = await paginate(host.current, s, book, { live: () => live, progress: (n) => live && setSettingAt(n) });
          if (!live) return;
          setPages(next);
        } catch (e) {
          if (e instanceof PaginateCancelled || !live) return;
          onError(`Couldn’t set the pages. ${e instanceof Error ? e.message : String(e)}`);
        }
        setSetting(false);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [chapters, layoutKey]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The first page is a right-hand page on its own; after that, pages face each other in pairs.
  const spreads = useMemo(() => {
    if (!pages) return [] as [number | null, number | null][];
    const out: [number | null, number | null][] = [[null, 0]];
    for (let i = 1; i < pages.length; i += 2) out.push([i, i + 1 < pages.length ? i + 1 : null]);
    return out;
  }, [pages]);
  const at = Math.min(spread, Math.max(0, spreads.length - 1));
  const current = spreads[at] ?? [null, null];

  const go = (n: number) => setSpread(Math.max(0, Math.min(spreads.length - 1, n)));
  const goToPage = (index: number) => go(index === 0 ? 0 : Math.ceil(index / 2));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === 'Escape') {
        if (serveOpen) setServeOpen(false);
        else onClose();
      } else if (view === 'print' && (e.key === 'ArrowRight' || e.key === 'PageDown')) go(at + 1);
      else if (view === 'print' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) go(at - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, spreads.length, view, serveOpen, onClose]);

  const set = (changes: Partial<PlateSettings>) => onChange({ ...s, ...changes });

  const pick = (row: Row) => {
    setPicked(sameRow(picked, row) && row.section !== 'chapter' ? null : row);
    if (!pages) return;
    const index = pages.findIndex((p) =>
      row.section === 'chapter' ? p.chapter === row.id && p.opener : row.section === 'front' ? p.kind === row.id : p.kind === 'matter',
    );
    if (index >= 0) goToPage(index);
  };

  // Rows are dragged within their own part of the book.
  const drag = useRef<{ section: Row['section']; from: number } | null>(null);
  const [dropAt, setDropAt] = useState<{ section: Row['section']; index: number } | null>(null);
  const reorder = (section: Row['section'], from: number, to: number) => {
    if (from === to) return;
    if (section === 'front') set({ front: moveTo(s.front, from, to) });
    else if (section === 'back') set({ back: moveTo(s.back, from, to) });
    else set({ chapterOrder: moveTo(ordered.map((c) => c.path), from, to) });
  };
  const rowProps = (section: Row['section'], index: number, count: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      drag.current = { section, from: index };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    onDragOver: (e: React.DragEvent) => {
      if (drag.current?.section !== section) return;
      e.preventDefault();
      setDropAt({ section, index });
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (drag.current?.section === section) reorder(section, drag.current.from, index);
      drag.current = null;
      setDropAt(null);
    },
    onDragEnd: () => {
      drag.current = null;
      setDropAt(null);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowUp' && index > 0) (e.preventDefault(), reorder(section, index, index - 1));
      if (e.key === 'ArrowDown' && index < count - 1) (e.preventDefault(), reorder(section, index, index + 1));
    },
  });

  const toggleMatter = <T extends string>(list: Matter<T>[], id: T): Matter<T>[] => list.map((m) => (m.id === id ? { ...m, on: !m.on } : m));

  const pageOf = (id: string) => {
    if (!pages) return '';
    const p = pages.find((x) => x.chapter === id && x.opener);
    return p?.folio ? String(p.folio) : '';
  };

  const matterEditor = (row: Row): ReactNode => {
    if (row.section === 'chapter') return null;
    const box = (label: string, value: string, key: keyof PlateSettings, placeholder: string, rows = 3) => (
      <label className="plate-field">
        <span>{label}</span>
        <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
      </label>
    );
    const line = (label: string, value: string, key: keyof PlateSettings, placeholder: string) => (
      <label className="plate-field">
        <span>{label}</span>
        <input value={value} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} />
      </label>
    );
    switch (row.id) {
      case 'title':
        return (
          <>
            {line('Subtitle', s.subtitle, 'subtitle', 'Optional')}
            {line('Author', s.author, 'author', 'Your name as it goes on the book')}
          </>
        );
      case 'copyright':
        return box('Copyright page', s.copyright, 'copyright', defaultCopyright(s.author), 4);
      case 'dedication':
        return box('Dedication', s.dedication, 'dedication', 'For …');
      case 'contents':
        return <p className="plate-hint">Made from your chapters, with their page numbers.</p>;
      case 'acknowledgements':
        return box('Acknowledgements', s.acknowledgements, 'acknowledgements', 'Thank you to …', 5);
      case 'about':
        return box('About the author', s.about, 'about', 'A few lines about you', 5);
    }
  };

  const check = (on: boolean, label: string, flip: () => void) => (
    <input
      type="checkbox"
      className="plate-check"
      checked={on}
      aria-label={`Include ${label}`}
      onClick={(e) => e.stopPropagation()}
      onChange={flip}
    />
  );

  const serveEpub = async () => {
    setServeOpen(false);
    try {
      const data = plateEpub(book, s, await bookId());
      if (await saveFile(title, data, KINDS.epub)) say(`Served “${title}” as an EPUB e-book.`);
    } catch (e) {
      onError(`Couldn’t serve the e-book. ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const servePdf = async () => {
    setServeOpen(false);
    if (!pages) return;
    try {
      // The print dialog's Save as PDF makes the file, page for page as the preview shows it.
      await printHtml(printBookHtml(pages, s, title));
    } catch (e) {
      onError(`Couldn’t serve the PDF. ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // The spread fits the space it has.
  const pad = 48;
  const scale = Math.min(1.25, (stageSize.width - pad * 2) / (g.width * 2), (stageSize.height - pad * 2 - 30) / g.height);
  const words = included.reduce((n, c) => n + c.words, 0);
  const ebookChapter = (() => {
    if (picked?.section === 'chapter') return included.find((c) => c.path === picked.id) ?? included[0];
    const p = pages?.[current[1] ?? current[0] ?? 0];
    return included.find((c) => c.path === p?.chapter) ?? included[0];
  })();

  const pageView = (index: number | null, side: 'verso' | 'recto') =>
    index === null || !pages?.[index] ? (
      <div className={`pp-slot empty ${side}`} style={{ width: g.width * scale, height: g.height * scale }} />
    ) : (
      <div className={`pp-slot ${side}`} style={{ width: g.width * scale, height: g.height * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} dangerouslySetInnerHTML={{ __html: pageHtml(pages[index], index, s, title) }} />
      </div>
    );

  const label = (index: number | null) => (index === null ? '' : String(index + 1));
  const pageLabel = pages ? (current[0] === null ? `Page 1 of ${pages.length}` : current[1] === null ? `Page ${label(current[0])} of ${pages.length}` : `Pages ${label(current[0])}–${label(current[1])} of ${pages.length}`) : 'Setting the pages…';

  return (
    <div className="plate" role="dialog" aria-label="Plate">
      <style>{plateCss(s) + pageCss(s)}</style>
      <header className="plate-top">
        <span className="plate-brand">cookbook</span>
        <span className="plate-crumb">{title} · Plate</span>
        <span className="plate-top-gap" />
        <button className="plate-btn" onClick={onClose}>
          Cancel
        </button>
        <div className="plate-serve">
          <button className="plate-btn primary" aria-haspopup="menu" aria-expanded={serveOpen} disabled={!pages} onClick={() => setServeOpen(!serveOpen)}>
            Serve <span className="plate-caret">▾</span>
          </button>
          {serveOpen && (
            <div className="plate-menu" role="menu">
              <button role="menuitem" onClick={() => void serveEpub()}>
                <span>EPUB e-book</span>
                <small>.epub</small>
              </button>
              <button role="menuitem" onClick={() => void servePdf()}>
                <span>Print-ready PDF</span>
                <small>{TRIMS[s.trim].label} in</small>
              </button>
              <button role="menuitem" disabled>
                <span>Word document</span>
                <small>coming later</small>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="plate-main">
        <aside className="plate-side plate-book" aria-label="Book">
          <h2>Book</h2>
          <div className="plate-sec">Front matter</div>
          {s.front.map((m, i) => {
            const row: Row = { section: 'front', id: m.id };
            return (
              <div key={m.id}>
                {dropAt?.section === 'front' && dropAt.index === i && <div className="plate-drop" />}
                <div className={`plate-row${m.on ? '' : ' off'}${sameRow(picked, row) ? ' cur' : ''}`} tabIndex={0} onClick={() => pick(row)} {...rowProps('front', i, s.front.length)}>
                  <span className="plate-grip" aria-hidden="true">⋮⋮</span>
                  {check(m.on, FRONT_LABELS[m.id], () => set({ front: toggleMatter(s.front, m.id) }))}
                  <span className="plate-row-t">{FRONT_LABELS[m.id]}</span>
                </div>
                {sameRow(picked, row) && <div className="plate-edit">{matterEditor(row)}</div>}
              </div>
            );
          })}
          <div className="plate-sec">
            Chapters <span>from the Shelf</span>
          </div>
          {!chapters && <p className="plate-hint">Gathering the chapters…</p>}
          {chapters && ordered.length === 0 && <p className="plate-hint">Nothing on the Shelf to set yet.</p>}
          {ordered.map((c, i) => {
            const row: Row = { section: 'chapter', id: c.path };
            const on = !s.skipped.includes(c.path);
            const n = included.indexOf(c) + 1;
            return (
              <div key={c.path}>
                {dropAt?.section === 'chapter' && dropAt.index === i && <div className="plate-drop" />}
                <div className={`plate-row${on ? '' : ' off'}${sameRow(picked, row) ? ' cur' : ''}`} tabIndex={0} title={`${c.words.toLocaleString()} words`} onClick={() => pick(row)} {...rowProps('chapter', i, ordered.length)}>
                  <span className="plate-grip" aria-hidden="true">⋮⋮</span>
                  {check(on, c.title, () => set({ skipped: on ? [...s.skipped, c.path] : s.skipped.filter((p) => p !== c.path) }))}
                  <span className="plate-row-t">{on ? `${n} · ${c.title}` : c.title}</span>
                  <span className="plate-row-pg">{on ? pageOf(c.path) : '–'}</span>
                </div>
              </div>
            );
          })}
          <div className="plate-sec">Back matter</div>
          {s.back.map((m, i) => {
            const row: Row = { section: 'back', id: m.id };
            return (
              <div key={m.id}>
                {dropAt?.section === 'back' && dropAt.index === i && <div className="plate-drop" />}
                <div className={`plate-row${m.on ? '' : ' off'}${sameRow(picked, row) ? ' cur' : ''}`} tabIndex={0} onClick={() => pick(row)} {...rowProps('back', i, s.back.length)}>
                  <span className="plate-grip" aria-hidden="true">⋮⋮</span>
                  {check(m.on, BACK_LABELS[m.id], () => set({ back: toggleMatter(s.back, m.id) }))}
                  <span className="plate-row-t">{BACK_LABELS[m.id]}</span>
                </div>
                {sameRow(picked, row) && <div className="plate-edit">{matterEditor(row)}</div>}
              </div>
            );
          })}
          <p className="plate-note">Drag to reorder. Untick to leave a part out of the book; the Shelf itself is not changed.</p>
        </aside>

        <section className={`plate-stage${margins ? ' show-margins' : ''}`}>
          <div className="plate-stagebar">
            <div className="plate-seg" role="tablist" aria-label="Preview">
              <button role="tab" aria-selected={view === 'print'} onClick={() => setView('print')}>
                Print
              </button>
              <button role="tab" aria-selected={view === 'ebook'} onClick={() => setView('ebook')}>
                Ebook
              </button>
            </div>
            {view === 'print' ? (
              <span className="plate-nav">
                <button aria-label="Previous pages" disabled={at === 0} onClick={() => go(at - 1)}>
                  ‹
                </button>
                <span>{pageLabel}</span>
                <button aria-label="Next pages" disabled={at >= spreads.length - 1} onClick={() => go(at + 1)}>
                  ›
                </button>
              </span>
            ) : (
              <span className="plate-nav">
                <span>{ebookChapter ? ebookChapter.title : ''}</span>
              </span>
            )}
            <label className="plate-inline">
              Margins <input type="checkbox" role="switch" className="switch" checked={margins} onChange={(e) => setMargins(e.target.checked)} disabled={view !== 'print'} />
            </label>
          </div>
          <div className="plate-desk" ref={stage}>
            {view === 'print' ? (
              <>
                <div className="plate-spread">
                  {pageView(current[0], 'verso')}
                  {pageView(current[1], 'recto')}
                </div>
              </>
            ) : (
              <div className="plate-reader">
                <div className="plate-reader-screen plate-text" style={{ fontSize: '12pt' }}>
                  {ebookChapter && <div dangerouslySetInnerHTML={{ __html: openerHtml(s, included.indexOf(ebookChapter) + 1, ebookChapter.title) + markFirst(ebookChapter.html) }} />}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="plate-side plate-style" aria-label="Style">
          <h2>Style</h2>
          <div className="plate-f">
            <div className="plate-lbl">Template</div>
            <div className="plate-tpls">
              {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
                <button key={id} className={`plate-tpl${s.template === id ? ' on' : ''}`} aria-pressed={s.template === id} onClick={() => onChange(withTemplate(s, id))}>
                  <span className={`plate-mini mini-${id}`} aria-hidden="true">
                    <em />
                    <b>T</b>
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  {TEMPLATES[id].label}
                </button>
              ))}
            </div>
          </div>
          <div className="plate-f">
            <div className="plate-lbl">Trim size</div>
            <div className="plate-seg wide" role="radiogroup" aria-label="Trim size">
              {(Object.keys(TRIMS) as TrimId[]).map((id) => (
                <button key={id} role="radio" aria-checked={s.trim === id} aria-selected={s.trim === id} onClick={() => set({ trim: id })}>
                  {TRIMS[id].label}
                </button>
              ))}
            </div>
            <div className="plate-hint">Inches, for the printed book.</div>
          </div>
          <div className="plate-f">
            <div className="plate-lbl">Body text</div>
            <div className="plate-two">
              <select aria-label="Font" value={s.font} onChange={(e) => set({ font: e.target.value })}>
                {PLATE_FONTS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select aria-label="Size" value={s.size} onChange={(e) => set({ size: Number(e.target.value) })}>
                {[9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13].map((n) => (
                  <option key={n} value={n}>
                    {n} pt
                  </option>
                ))}
              </select>
            </div>
            <div className="plate-two">
              <span className="plate-hint">Line spacing</span>
              <select aria-label="Line spacing" value={s.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })}>
                {[1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="plate-f">
            <div className="plate-lbl">Chapter opener</div>
            <select aria-label="Chapter opener" value={s.opener} onChange={(e) => set({ opener: e.target.value as OpenerId })}>
              {(Object.keys(OPENERS) as OpenerId[]).map((id) => (
                <option key={id} value={id}>
                  {OPENERS[id]}
                </option>
              ))}
            </select>
          </div>
          <div className="plate-f">
            <div className="plate-lbl">Scene break</div>
            <select aria-label="Scene break" value={s.sceneBreak} onChange={(e) => set({ sceneBreak: e.target.value })}>
              {SCENE_BREAKS.map((b) => (
                <option key={b.label} value={b.glyph}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="plate-f">
            {(
              [
                ['dropCap', 'Drop cap', 'First letter three lines tall, first line in small caps'],
                ['runningHeaders', 'Running headers', 'Author on the left, title on the right, hidden on openers'],
                ['pageNumbers', 'Page numbers', 'At the foot of the page, from 1 at the first chapter'],
                ['rectoStarts', 'Chapters on right-hand pages', 'Leaves a blank page before when needed'],
              ] as const
            ).map(([key, name, sub]) => (
              <label key={key} className="plate-trow">
                <span>
                  {name}
                  <small>{sub}</small>
                </span>
                <input type="checkbox" role="switch" className="switch" checked={s[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              </label>
            ))}
          </div>
        </aside>
      </div>
      <footer className="plate-status">
        <span>
          {pages ? `${pages.length} pages · ` : ''}
          {words.toLocaleString()} words · {TRIMS[s.trim].label} in · {TEMPLATES[s.template].label}
        </span>
        <span>{setting ? (settingAt > 0 ? `Setting page ${settingAt.toLocaleString()}…` : 'Setting the pages…') : 'Preview up to date'}</span>
      </footer>
      <div className="plate-measure" ref={host} aria-hidden="true" />
    </div>
  );
}
