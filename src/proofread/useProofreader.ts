import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Editor } from '@tiptap/core';
import { type StorageAdapter } from '../storage/adapter';
import { type Dialect } from './check';
import { type Around } from './context';
import { WorkerChecker } from './client';
import { type FoundIssue, forgetWord, setChecker, setIgnored, setReview, setRulesOff } from './plugin';
import { BOOK_WIDE, type Ignored, defaultDialect, readDictionary, readIgnored, saveDictionary, saveIgnored } from './store';

export interface Proofreader {
  dialect: Dialect;
  setDialect: (dialect: Dialect) => void;
  /** The writer's own dictionary. */
  words: string[];
  addWord: (word: string) => void;
  removeWord: (word: string) => void;
  /** Leaves an issue alone just here, or everywhere in the book. */
  ignore: (issue: FoundIssue, scope: 'once' | 'always') => void;
  /** How many things are ignored in the book, and a way to bring them all back. */
  ignoredCount: number;
  clearIgnored: () => void;
  /** Rule groups switched off (see rules.ts). */
  off: string[];
  setRuleOn: (rule: string, on: boolean) => void;
  /** Suggestions for a misspelling, in the order that fits the words around it. */
  suggest: (word: string, around?: Around) => Promise<string[]>;
}

interface Options {
  fs: StorageAdapter | null;
  /** The book's chosen spelling, if it has one. */
  dialect: Dialect | undefined;
  onDialect: (dialect: Dialect) => void;
  /** Rule groups the book has switched off. */
  off: string[] | undefined;
  /** Rule groups nobody is checking for now, because their seasoning isn't picked. Not saved. */
  resting?: string[];
  onOff: (off: string[]) => void;
  editor: Editor | null;
  /** The open scene or card, whose ignored words apply. */
  docId: string | null;
  /** Every character's and setting's names, never flagged and checked for near misses. */
  names: string[];
  /** Reviewing (Seasonings is open): grammar and style are checked too. */
  review: boolean;
  /** Every page's text, whose words count for more in suggestions; read only when one is wanted. */
  bookTexts?: () => string[];
  /** Goes up when the book's text may have changed. Read only when a suggestion is wanted. */
  bookVersion?: () => number;
  onError: (message: string) => void;
}

const NO_VERSION = () => 0;

/** The proofreader for the open book: its worker, the writer's dictionary and ignored words. */
export function useProofreader({ fs, dialect: chosen, onDialect, off: offRules, resting, onOff, editor, docId, names, review, bookTexts, bookVersion = NO_VERSION, onError }: Options): Proofreader {
  const checker = useRef<WorkerChecker | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [ignored, setIgnoredWords] = useState<Ignored>({});
  const [ready, setReady] = useState(0);
  const dialect = chosen ?? defaultDialect();
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const bookRef = useRef({ texts: bookTexts, version: bookVersion, learnt: -1 });
  bookRef.current.texts = bookTexts;
  bookRef.current.version = bookVersion;

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const c = new WorkerChecker();
    checker.current = c;
    return () => {
      c.destroy();
      checker.current = null;
    };
  }, []);

  useEffect(() => {
    setWords([]);
    setIgnoredWords({});
    bookRef.current.learnt = -1;
    if (!fs) return;
    let live = true;
    Promise.all([readDictionary(fs), readIgnored(fs)]).then(
      ([w, i]) => {
        if (!live) return;
        setWords(w);
        setIgnoredWords(i);
      },
      (e: unknown) => errorRef.current(`Couldn’t read your dictionary: ${String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [fs]);

  // Names change rarely; only a real change reloads the dictionary.
  const namesKey = JSON.stringify([...new Set(names)].sort());
  const wordsKey = JSON.stringify(words);
  useEffect(() => {
    const c = checker.current;
    if (!c) return;
    let live = true;
    c.configure(dialect, JSON.parse(wordsKey) as string[], JSON.parse(namesKey) as string[]).then(
      () => live && setReady((n) => n + 1),
      (e: unknown) => live && errorRef.current(`The proofreader couldn’t start: ${e instanceof Error ? e.message : String(e)}`),
    );
    return () => {
      live = false;
    };
  }, [dialect, wordsKey, namesKey]);

  useEffect(() => {
    if (editor) setChecker(editor, ready > 0 ? checker.current : null);
  }, [editor, ready]);

  useEffect(() => {
    if (editor) setReview(editor, review);
  }, [editor, review]);

  const sceneIgnored = docId ? ignored[docId] : undefined;
  const bookIgnored = ignored[BOOK_WIDE];
  useEffect(() => {
    if (editor) setIgnored(editor, [...(bookIgnored ?? []), ...(sceneIgnored ?? [])]);
  }, [editor, sceneIgnored, bookIgnored]);

  const off = useMemo(() => offRules ?? [], [offRules]);
  const restingKey = (resting ?? []).join('\n');
  useEffect(() => {
    if (editor) setRulesOff(editor, [...off, ...(resting ?? [])]);
  }, [editor, off, restingKey]);

  const saveWords = useCallback(
    (next: string[]) => {
      setWords(next);
      if (fs) saveDictionary(fs, next).catch((e: unknown) => errorRef.current(`Couldn’t save your dictionary: ${String(e)}`));
    },
    [fs],
  );

  return useMemo<Proofreader>(
    () => ({
      dialect,
      setDialect: onDialect,
      words,
      addWord: (word) => {
        if (editor) forgetWord(editor, word);
        if (!words.includes(word)) saveWords([...words, word]);
      },
      removeWord: (word) => saveWords(words.filter((w) => w !== word)),
      ignore: (issue, scope) => {
        const where = scope === 'always' ? BOOK_WIDE : docId;
        if (!where) return;
        const key = scope === 'always' ? issue.key : issue.once;
        const next = { ...ignored, [where]: [...new Set([...(ignored[where] ?? []), key])] };
        setIgnoredWords(next);
        if (fs) saveIgnored(fs, next).catch(() => {});
      },
      ignoredCount: Object.values(ignored).reduce((n, keys) => n + keys.length, 0),
      clearIgnored: () => {
        setIgnoredWords({});
        if (fs) saveIgnored(fs, {}).catch(() => {});
      },
      off,
      setRuleOn: (rule, on) => onOff(on ? off.filter((r) => r !== rule) : [...new Set([...off, rule])]),
      suggest: (word, around) => {
        const c = checker.current;
        if (!c) return Promise.resolve([]);
        // The book is read again only when a suggestion is wanted after it changed.
        const book = bookRef.current;
        const version = book.version();
        if (book.texts && book.learnt !== version) {
          book.learnt = version;
          c.learn(book.texts()).catch(() => {});
        }
        return c.suggest(word, around);
      },
    }),
    [dialect, onDialect, words, editor, saveWords, docId, ignored, fs, off, onOff],
  );
}
