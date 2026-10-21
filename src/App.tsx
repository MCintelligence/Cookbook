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
import { FindBox } from './ui/FindBox';
import { Logo } from './ui/Logo';
import { Toolbar } from './ui/Toolbar';
import { Tree } from './ui/Tree';

type Tab = 'book' | 'pantry';

const SAVE_DELAY_MS = 600;

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

  const nextStyle = useCallback((style: string) => paragraphStyle(sheet, style).next ?? style, [sheet]);
  const css = useMemo(() => stylesToCss(sheet), [sheet]);
  const words = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')) : 0),
  });

  return (
    <div className="app">
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
        <FindBox editor={editor} />
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
            />
          </article>
        ) : (
          <p className="empty">Pick a scene from the Bookshelf to start writing.</p>
        )}
      </main>

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
