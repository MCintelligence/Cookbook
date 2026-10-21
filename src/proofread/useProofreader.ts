import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Editor } from '@tiptap/core';
import { type StorageAdapter } from '../storage/adapter';
import { type Dialect, ignoreKey } from './check';
import { WorkerChecker } from './client';
import { type FoundIssue, forgetWord, setChecker, setIgnored, setReview } from './plugin';
import { type Ignored, defaultDialect, readDictionary, readIgnored, saveDictionary, saveIgnored } from './store';

export interface Proofreader {
  dialect: Dialect;
  setDialect: (dialect: Dialect) => void;
  /** The writer's own dictionary. */
  words: string[];
  addWord: (word: string) => void;
  removeWord: (word: string) => void;
  /** Leaves an issue alone in the open scene: that word, or for grammar and style, that rule on that text. */
  ignore: (issue: FoundIssue) => void;
  suggest: (word: string) => Promise<string[]>;
}

interface Options {
  fs: StorageAdapter | null;
  /** The book's chosen spelling, if it has one. */
  dialect: Dialect | undefined;
  onDialect: (dialect: Dialect) => void;
  editor: Editor | null;
  /** The open scene or card, whose ignored words apply. */
  docId: string | null;
  /** Every character's and setting's names, never flagged and checked for near misses. */
  names: string[];
  /** Reviewing (Seasonings is open): grammar and style are checked too. */
  review: boolean;
  onError: (message: string) => void;
}

/** The proofreader for the open book: its worker, the writer's dictionary and ignored words. */
export function useProofreader({ fs, dialect: chosen, onDialect, editor, docId, names, review, onError }: Options): Proofreader {
  const checker = useRef<WorkerChecker | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [ignored, setIgnoredWords] = useState<Ignored>({});
  const [ready, setReady] = useState(0);
  const dialect = chosen ?? defaultDialect();
  const errorRef = useRef(onError);
  errorRef.current = onError;

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
  useEffect(() => {
    if (editor) setIgnored(editor, sceneIgnored ?? []);
  }, [editor, sceneIgnored]);

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
      ignore: (issue) => {
        if (!docId) return;
        const key = ignoreKey(issue.issue, issue.word);
        const next = { ...ignored, [docId]: [...new Set([...(ignored[docId] ?? []), key])] };
        setIgnoredWords(next);
        if (fs) saveIgnored(fs, next).catch(() => {});
      },
      suggest: (word) => checker.current?.suggest(word) ?? Promise.resolve([]),
    }),
    [dialect, onDialect, words, editor, saveWords, docId, ignored, fs],
  );
}
