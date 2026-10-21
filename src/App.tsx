import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type StorageAdapter } from './storage/adapter';
import {
  BOOKSHELF,
  PANTRY,
  type BookInfo,
  type TreeNode,
  createBook,
  createDocument,
  openBook,
  readDocument,
  readTree,
  writeDocument,
} from './storage/book';
import { type CookbookDocument } from './storage/document';
import { countWords } from './storage/index';
import { defaultBookStorage } from './storage/platform';
import { type ParagraphStyle, type StyleSheet, defaultStyles, loadStyles, paragraphStyle, saveStyles, stylesToCss, updateParagraphStyle } from './styles/styles';
import { PageEditor } from './editor/PageEditor';
import { type SeasoningsRequest } from './editor/seasonings';
import { FindBox } from './ui/FindBox';
import { PageFootnotes } from './ui/PageFootnotes';
import { type Notes, Seasonings, type SeasoningsTab, useSeasoningsCount } from './ui/Seasonings';
import { Logo } from './ui/Logo';
import { Toolbar } from './ui/Toolbar';
import { Tree } from './ui/Tree';

type Tab = 'book' | 'pantry';

const SAVE_DELAY_MS = 600;

/** Notes to self live in the scene's front matter, keyed by the id of their anchor in the text. */
function readNotes(doc: CookbookDocument | null): Notes {
  const raw = doc?.fields.notes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([id, text]) => [id, typeof text === 'string' ? text : String(text ?? '')]));
}

async function openOrCreate(fs: StorageAdapter): Promise<BookInfo> {
  try {
    return await openBook(fs);
  } catch {
    const info = await createBook(fs, 'My Book');
    await fs.makeFolder(`${BOOKSHELF}/Chapter 1`);
    await createDocument(fs, `${BOOKSHELF}/Chapter 1`, 'First scene');
    return info;
  }
}

export function App() {
  const [fs, setFs] = useState<StorageAdapter | null>(null);
  const [where, setWhere] = useState('');
  const [book, setBook] = useState<BookInfo | null>(null);
  const [sheet, setSheet] = useState<StyleSheet>(defaultStyles);
  const [tab, setTab] = useState<Tab>('book');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<CookbookDocument | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasoningsOpen, setSeasoningsOpen] = useState(false);
  const [seasoningsTab, setSeasoningsTab] = useState<SeasoningsTab>('all');
  const [seasoningsRequest, setSeasoningsRequest] = useState<(SeasoningsRequest & { at: number }) | null>(null);
  const docRef = useRef<CookbookDocument | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<(() => Promise<void>) | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in development; open the book only once.
    if (started.current) return;
    started.current = true;
    defaultBookStorage()
      .then(async ({ fs, where }) => {
        setBook(await openOrCreate(fs));
        setSheet(await loadStyles(fs));
        setFs(fs);
        setWhere(where);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const refreshTree = useCallback(async () => {
    if (fs) setTree(await readTree(fs, tab === 'book' ? BOOKSHELF : PANTRY));
  }, [fs, tab]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const save = pendingSave.current;
    pendingSave.current = null;
    if (save) await save().catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    // Save straight away when the window is hidden or closed, rather than losing the last few words.
    const onHide = () => void flushSave();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushSave]);

  const scheduleSave = (next: CookbookDocument) => {
    if (!fs || !path) return;
    const target = path;
    docRef.current = next;
    pendingSave.current = () => writeDocument(fs, target, next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS);
  };

  const select = async (p: string) => {
    if (!fs) return;
    await flushSave();
    const opened = await readDocument(fs, p);
    docRef.current = opened;
    setPath(p);
    setDoc(opened);
  };

  const addScene = async () => {
    if (!fs) return;
    const folder = tab === 'book' ? BOOKSHELF : `${PANTRY}/characters`;
    const p = await createDocument(fs, folder, tab === 'book' ? 'New scene' : 'New character', tab === 'book' ? 'scene' : 'character');
    await refreshTree();
    await select(p);
  };

  const editStyle = (id: string, changes: Partial<ParagraphStyle>) => {
    const next = updateParagraphStyle(sheet, id, changes);
    setSheet(next);
    if (fs) saveStyles(fs, next).catch((e: unknown) => setError(String(e)));
  };

  const notes = readNotes(doc);
  const setNotes = (next: Notes) => {
    const base = docRef.current ?? doc;
    if (!base) return;
    const { notes: _old, ...fields } = base.fields;
    const updated = { ...base, fields: Object.keys(next).length > 0 ? { ...fields, notes: next } : fields };
    setDoc(updated);
    scheduleSave(updated);
  };

  const showInSeasonings = (request: SeasoningsRequest) => {
    // A note added from the keyboard needs its entry in the front matter too.
    if (request.tab === 'notes' && !(request.id in readNotes(docRef.current))) setNotes({ ...readNotes(docRef.current), [request.id]: '' });
    setSeasoningsOpen(true);
    setSeasoningsTab((t) => (t === 'all' || t === request.tab ? t : request.tab));
    setSeasoningsRequest({ ...request, at: Date.now() });
  };
  const seasoningsCount = useSeasoningsCount(editor, notes);

  const nextStyle = useCallback((style: string) => paragraphStyle(sheet, style).next ?? style, [sheet]);
  const css = useMemo(() => stylesToCss(sheet), [sheet]);
  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')) : 0),
  });

  return (
    <div className={`app${seasoningsOpen && doc ? ' with-seasonings' : ''}`}>
      <style>{css}</style>
      <header className="topbar">
        <div className="brand-wrap">
          <Logo />
          <span className="brand">Cookbook</span>
          <span className="crumb">
            {book?.title}
            {doc ? ` · ${doc.title}` : ''}
          </span>
        </div>
        <div className="top-actions">
          <button
            className="seasonings-button"
            aria-pressed={seasoningsOpen}
            aria-expanded={seasoningsOpen}
            disabled={!doc}
            onClick={() => setSeasoningsOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
            </svg>
            Seasonings
            {seasoningsCount > 0 && <span className="badge">{seasoningsCount}</span>}
          </button>
          <FindBox editor={editor} />
        </div>
      </header>

      <Toolbar editor={editor} sheet={sheet} onEditStyle={editStyle} />

      <nav className="sidebar" aria-label="Book and Pantry">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>
            Book
          </button>
          <button role="tab" aria-selected={tab === 'pantry'} onClick={() => setTab('pantry')}>
            Pantry
          </button>
        </div>
        <div className="section-label">
          <span>{tab === 'book' ? 'Bookshelf' : 'Pantry'}</span>
          <button className="ghost" onClick={addScene}>
            {tab === 'book' ? 'New scene' : 'New card'}
          </button>
        </div>
        <Tree nodes={tree} selected={path} onSelect={select} />
      </nav>

      <main className="desk">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {doc && path ? (
          <article className="cb-page" key={path}>
            <input
              className="scene-title"
              aria-label="Scene title"
              value={doc.title}
              onChange={(e) => {
                const next = { ...(docRef.current ?? doc), title: e.target.value };
                setDoc(next);
                scheduleSave(next);
              }}
            />
            <PageEditor
              initialBody={doc.body}
              nextStyle={nextStyle}
              onReady={setEditor}
              onChange={(body) => scheduleSave({ ...(docRef.current ?? doc), body })}
              onSeasonings={showInSeasonings}
            />
            <PageFootnotes editor={editor} />
          </article>
        ) : (
          <p className="empty">Pick a scene from the Bookshelf to start writing.</p>
        )}
      </main>

      {seasoningsOpen && doc && (
        <Seasonings
          editor={editor}
          notes={notes}
          onNotesChange={setNotes}
          tab={seasoningsTab}
          onTab={setSeasoningsTab}
          request={seasoningsRequest}
          onRequest={showInSeasonings}
          onClose={() => setSeasoningsOpen(false)}
        />
      )}

      <footer className="footer">
        <span>{doc ? `${(words ?? 0).toLocaleString('en')} words` : ''}</span>
        <span>
          {doc ? 'US Letter · 100% · ' : ''}
          {where}
        </span>
      </footer>
    </div>
  );
}
