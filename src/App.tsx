import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Logo } from './ui/Logo';
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
  const [tab, setTab] = useState<Tab>('book');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<CookbookDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const flushSave = async () => {
    window.clearTimeout(saveTimer.current);
    const save = pendingSave.current;
    pendingSave.current = null;
    if (save) await save().catch((e: unknown) => setError(String(e)));
  };

  useEffect(() => {
    // Save straight away when the window is hidden or closed, rather than losing the last few words.
    const onHide = () => void flushSave();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  });

  const select = async (p: string) => {
    if (!fs) return;
    await flushSave();
    setPath(p);
    setDoc(await readDocument(fs, p));
  };

  const edit = (body: string) => {
    if (!fs || !path || !doc) return;
    const next = { ...doc, body };
    setDoc(next);
    pendingSave.current = () => writeDocument(fs, path, next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), SAVE_DELAY_MS);
  };

  const addScene = async () => {
    if (!fs) return;
    const folder = tab === 'book' ? BOOKSHELF : `${PANTRY}/characters`;
    const p = await createDocument(fs, folder, tab === 'book' ? 'New scene' : 'New character', tab === 'book' ? 'scene' : 'character');
    await refreshTree();
    await select(p);
  };

  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <span className="brand">Cookbook</span>
        <span className="crumb">{book?.title}{doc ? ` · ${doc.title}` : ''}</span>
      </header>

      <nav className="sidebar" aria-label="Book and Pantry">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>Book</button>
          <button role="tab" aria-selected={tab === 'pantry'} onClick={() => setTab('pantry')}>Pantry</button>
        </div>
        <div className="section-label">
          <span>{tab === 'book' ? 'Bookshelf' : 'Pantry'}</span>
          <button className="ghost" onClick={addScene}>{tab === 'book' ? 'New scene' : 'New card'}</button>
        </div>
        <Tree nodes={tree} selected={path} onSelect={select} />
      </nav>

      <main className="page">
        {error && <p role="alert" className="error">{error}</p>}
        {doc ? (
          <>
            <h1 className="scene-title">{doc.title}</h1>
            <textarea
              className="editor"
              aria-label={`Text of ${doc.title}`}
              value={doc.body}
              onChange={(e) => edit(e.target.value)}
              placeholder="Start writing…"
            />
          </>
        ) : (
          <p className="empty">Pick a scene from the Bookshelf to start writing.</p>
        )}
      </main>

      <footer className="footer">
        <span>{doc ? `${countWords(doc.body).toLocaleString('en')} words` : ''}</span>
        <span>{where}</span>
      </footer>
    </div>
  );
}
