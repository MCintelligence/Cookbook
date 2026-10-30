import { type Editor } from '@tiptap/core';
import { closeHistory, redo, undo, undoDepth } from '@tiptap/pm/history';
import { EditorState, type Plugin, Selection, type Transaction } from '@tiptap/pm/state';
import { Step } from '@tiptap/pm/transform';
import { type StorageAdapter, joinPath } from '../storage/adapter';
import { HIDDEN_FOLDER } from '../storage/book';
import { type NodeJSON, parseMarkdown, serializeMarkdown } from './markdown';

/**
 * Undo that survives closing a scene or the app.
 *
 * ProseMirror's history cannot be saved directly, so every change is logged
 * instead: its steps, its time and the selection before it, plus each undo
 * and redo. Opening the scene replays the log from where it started, which
 * rebuilds the same undo history, grouped the same way. If the replayed text
 * does not match the file (it was changed elsewhere, or the log is behind),
 * the log is dropped and undo starts fresh. The text itself is never at risk.
 */
export interface UndoLog {
  version: 1;
  /** The scene as it was before the first logged change. */
  base: NodeJSON;
  entries: LogEntry[];
}

export type LogEntry = ChangeEntry | { u: 1 } | { r: 1 };

interface ChangeEntry {
  /** When it happened, which decides how changes group into one undo. */
  t: number;
  /** The steps, as JSON. */
  s: unknown[];
  /** The selection before it, which undo puts back. */
  sel: unknown;
  /** Set when the change was kept out of the undo history. */
  h?: 0;
  /** Set when a plugin appended this change to the one before. */
  a?: 1;
  /** IME composition id, which also affects grouping. */
  c?: number;
  /** Set when the change starts a new undo step on purpose (typing shortcuts do). */
  x?: 1;
}

/** Only this many changes are kept; older ones fall off when the scene is next opened. */
export const MAX_ENTRIES = 3000;
const HISTORY_META = 'history$';
const CLOSE_HISTORY_META = 'closeHistory$';

function isUndoLog(value: unknown): value is UndoLog {
  const log = value as UndoLog | null;
  return !!log && log.version === 1 && typeof log.base === 'object' && Array.isArray(log.entries);
}

export function parseUndoLog(text: string): UndoLog | null {
  try {
    const value: unknown = JSON.parse(text);
    return isUndoLog(value) ? value : null;
  } catch {
    return null;
  }
}

/** Keeps a scene's undo log while it is open. */
export class UndoRecorder {
  base: NodeJSON;
  entries: LogEntry[] = [];
  private replaying = false;
  private selectionBefore: unknown = null;
  /** Bumped on every logged change, so callers can tell whether there is anything new to save. */
  version = 0;

  constructor(private editor: Editor) {
    this.base = editor.getJSON() as NodeJSON;
    editor.on('beforeTransaction', this.before);
    editor.on('transaction', this.after);
  }

  get isReplaying(): boolean {
    return this.replaying;
  }

  /** How many undo steps are available right now. */
  depth(): number {
    return undoDepth(this.editor.state);
  }

  toJSON(): UndoLog {
    return { version: 1, base: this.base, entries: this.entries };
  }

  destroy(): void {
    this.editor.off('beforeTransaction', this.before);
    this.editor.off('transaction', this.after);
  }

  private before = () => {
    this.selectionBefore = this.editor.state.selection.toJSON();
  };

  private after = ({ transaction: tr }: { transaction: Transaction }) => {
    if (this.replaying || !tr.docChanged) return;
    const history = tr.getMeta(HISTORY_META) as { redo: boolean } | undefined;
    if (history) this.entries.push(history.redo ? { r: 1 } : { u: 1 });
    else {
      const entry: ChangeEntry = { t: tr.time, s: tr.steps.map((s) => s.toJSON()), sel: this.selectionBefore };
      if (tr.getMeta('addToHistory') === false) entry.h = 0;
      if (tr.getMeta('appendedTransaction')) entry.a = 1;
      if (tr.getMeta(CLOSE_HISTORY_META)) entry.x = 1;
      const composition = tr.getMeta('composition') as number | undefined;
      if (typeof composition === 'number') entry.c = composition;
      this.entries.push(entry);
    }
    this.version++;
  };

  /**
   * Starts the editor from a saved log and replays it. `expected` is the
   * scene's text from its file. Returns false, and starts the editor fresh on
   * that text, when the log does not lead to it.
   */
  restore(log: UndoLog, expected: string): boolean {
    // Both sides go through the same parse, so whitespace the file format
    // trims (such as trailing spaces) can't make a good log look wrong.
    const normal = (text: string) => serializeMarkdown(parseMarkdown(text));
    const target = normal(expected);
    this.replaying = true;
    try {
      const { schema, plugins } = this.editor.state;
      // The log is replayed off screen, on a state that has only the undo history and the
      // plugins that add changes of their own, then shown once. Going through the editor
      // would draw the page, run every other plugin and re-render the app once per change.
      let state = EditorState.create({ doc: schema.nodeFromJSON(log.base), plugins: plugins.filter(replayed) });
      const apply = (tr: Transaction) => (state = state.apply(tr));
      const keepFrom = Math.max(0, log.entries.length - MAX_ENTRIES);
      let base = log.base;
      log.entries.forEach((entry, i) => {
        if (i === keepFrom && i > 0) base = state.doc.toJSON() as NodeJSON;
        if ('u' in entry) undo(state, apply);
        else if ('r' in entry) redo(state, apply);
        else {
          apply(state.tr.setSelection(Selection.fromJSON(state.doc, entry.sel)));
          const tr = state.tr;
          for (const step of entry.s) {
            const result = tr.maybeStep(Step.fromJSON(schema, step));
            if (result.failed) throw new Error(result.failed);
          }
          tr.setTime(entry.t);
          if (entry.h === 0) tr.setMeta('addToHistory', false);
          if (entry.a) tr.setMeta('appendedTransaction', state.tr);
          if (entry.x) closeHistory(tr);
          if (entry.c !== undefined) tr.setMeta('composition', entry.c);
          apply(tr);
        }
      });
      if (normal(serializeMarkdown(state.doc.toJSON() as NodeJSON)) !== target) throw new Error('The log does not match the file.');
      // The other plugins start on the finished text, as they do when a scene opens without a log.
      this.editor.view.updateState(state.reconfigure({ plugins }));
      // An empty change, so everything that follows the editor (word count, footnotes) catches up.
      this.editor.view.dispatch(this.editor.state.tr.setMeta('addToHistory', false));
      this.base = base;
      this.entries = log.entries.slice(keepFrom);
      // The cursor is left where the last change was made.
      return true;
    } catch {
      this.reset(parseMarkdown(expected));
      this.base = this.editor.getJSON() as NodeJSON;
      this.entries = [];
      return false;
    } finally {
      this.replaying = false;
    }
  }

  /** Puts a fresh document in the editor with an empty undo history. */
  private reset(doc: NodeJSON): void {
    const { state, view } = this.editor;
    view.updateState(EditorState.create({ doc: state.schema.nodeFromJSON(doc), plugins: state.plugins }));
  }
}

/** The plugins a replay needs: the undo history, and any that add changes of their own, so the text comes out the same. */
function replayed(plugin: Plugin): boolean {
  const key = (plugin as unknown as { key: string }).key;
  return key === HISTORY_META || !!plugin.spec.appendTransaction || !!plugin.spec.filterTransaction;
}

// ---------- where logs are kept ----------

/** One log per scene, named by the scene's id so it follows the scene when the file is renamed or moved. */
export function undoLogPath(id: string): string {
  return joinPath(HIDDEN_FOLDER, 'undo', `${id}.json`);
}

export async function readUndoLog(fs: StorageAdapter, id: string): Promise<UndoLog | null> {
  const path = undoLogPath(id);
  if (!(await fs.exists(path))) return null;
  return parseUndoLog(await fs.readText(path).catch(() => ''));
}

export async function writeUndoLog(fs: StorageAdapter, id: string, log: UndoLog): Promise<void> {
  await fs.makeFolder(joinPath(HIDDEN_FOLDER, 'undo'));
  await fs.writeText(undoLogPath(id), JSON.stringify(log));
}
