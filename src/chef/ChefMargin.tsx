import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type MenuItem } from '../ui/Menu';
import { type ChefNote, changeNote, deleteNote, newId, notesState, pickNote } from './notes';

interface Props {
  editor: Editor;
  /** Who is writing, for the cards; "You" when the writer gave no name. */
  writer: string;
  showResolved: boolean;
  onMenu: (label: string, x: number, y: number, items: MenuItem[], opener?: HTMLElement) => void;
}

const GAP = 10;

/** When a note was written, short: "Just now", "5 min ago", "09:30", "Tue 09:30", "12 Nov". */
export function whenWritten(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const mins = Math.round((now.getTime() - at.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return time;
  if (now.getTime() - at.getTime() < 6 * 86_400_000) return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(at.getFullYear() !== now.getFullYear() && { year: 'numeric' }) });
}

/**
 * The Chef notes' margin, to the right of the page in Chef Mode, as Word shows comments: each card
 * level with its words, pushed down (or up, above the one picked) so none overlap. The cards are
 * laid out by moving them, not by drawing the margin again, and only when the page's text or size
 * changes; a move of the cursor costs nothing.
 */
export function ChefMargin({ editor, writer, showResolved, onMenu }: Props) {
  const state = useEditorState({ editor, selector: ({ editor }) => notesState(editor) });
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const notes = (state?.notes ?? []).filter((n) => showResolved || !n.resolved);
  const active = state?.active ?? null;

  const layout = useCallback(() => {
    const margin = box.current;
    const s = notesState(editor);
    if (!margin || !s || editor.isDestroyed) return;
    const top0 = margin.getBoundingClientRect().top;
    const size = editor.state.doc.content.size;
    const placed = s.notes
      .map((n) => {
        const el = cards.current.get(n.id);
        if (!el) return null;
        let want = 0;
        try {
          want = editor.view.coordsAtPos(Math.min(n.from, size), 1).top - top0;
        } catch {
          // A place the page can't show yet stays where it was.
          want = el.offsetTop;
        }
        return { el, want, h: el.offsetHeight, id: n.id };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.want - b.want);
    const pick = placed.findIndex((p) => p.id === notesState(editor)?.active);
    const tops = placed.map((p) => p.want);
    const start = pick >= 0 ? pick : 0;
    // From the picked card (or the first) down, each below the one above it...
    for (let i = start + 1; i < placed.length; i++) tops[i] = Math.max(tops[i]!, tops[i - 1]! + placed[i - 1]!.h + GAP);
    // ...and above it, each clear of the one below.
    for (let i = start - 1; i >= 0; i--) tops[i] = Math.min(tops[i]!, tops[i + 1]! - placed[i]!.h - GAP);
    // Nothing goes above the top of the page.
    const over = Math.min(0, ...tops.slice(0, 1));
    placed.forEach((p, i) => {
      const top = Math.round(tops[i]! - over);
      p.el.style.transform = `translateY(${top}px)`;
      p.el.style.visibility = 'visible';
    });
    margin.style.minHeight = `${Math.max(0, ...placed.map((p, i) => tops[i]! - over + p.h))}px`;
  }, [editor]);

  // After every draw of the margin (a note added, changed, picked, or opened to be written).
  useLayoutEffect(layout);
  useEffect(() => {
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    // The text moved: a change to it, or the page's size, font or spacing.
    editor.on('update', soon);
    const watch = new ResizeObserver(soon);
    watch.observe(editor.view.dom);
    return () => {
      cancelAnimationFrame(frame);
      editor.off('update', soon);
      watch.disconnect();
    };
  }, [editor, layout]);

  if (notes.length === 0) return null;
  return (
    <div className="chef-margin" ref={box} aria-label="Chef notes" role="complementary">
      {notes.map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          editor={editor}
          writer={writer}
          active={n.id === active}
          fresh={n.id === state?.fresh}
          onMenu={onMenu}
          onSize={layout}
          refEl={(el) => {
            if (el) cards.current.set(n.id, el);
            else cards.current.delete(n.id);
          }}
        />
      ))}
    </div>
  );
}

interface CardProps {
  note: ChefNote;
  editor: Editor;
  writer: string;
  active: boolean;
  fresh: boolean;
  onMenu: Props['onMenu'];
  onSize: () => void;
  refEl: (el: HTMLElement | null) => void;
}

function NoteCard({ note, editor, writer, active, fresh, onMenu, onSize, refEl }: CardProps) {
  const [editing, setEditing] = useState(fresh);
  const [draft, setDraft] = useState(note.text);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const replyArea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (fresh) setEditing(true);
  }, [fresh]);
  useEffect(() => {
    if (editing) setDraft(note.text);
  }, [editing]);
  const gone = !!note.quote && note.to <= note.from;

  const save = () => {
    const text = draft.trim();
    if (!text && !note.text) return deleteNote(editor, note.id);
    changeNote(editor, note.id, { text: text || note.text });
    setEditing(false);
    editor.commands.focus(undefined, { scrollIntoView: false });
  };
  const cancel = () => {
    setEditing(false);
    // A new note left with nothing written goes away again.
    if (!note.text) deleteNote(editor, note.id);
    else changeNote(editor, note.id, {});
    editor.commands.focus(undefined, { scrollIntoView: false });
  };
  const postReply = () => {
    const text = reply.trim();
    if (!text) return setReplying(false);
    changeNote(editor, note.id, (n) => ({ replies: [...(n.replies ?? []), { id: newId(), text, at: new Date().toISOString() }] }));
    setReply('');
    setReplying(false);
  };
  const keys = (e: React.KeyboardEvent, done: () => void, back: () => void) => {
    if (e.key === 'Escape') {
      // Escape here only closes the box; it doesn't leave Chef Mode.
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      back();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      done();
    }
  };
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    onSize();
  };
  const menu = (x: number, y: number, opener?: HTMLElement) =>
    onMenu(
      'Chef note',
      x,
      y,
      [
        { label: 'Edit', disabled: note.resolved, onPick: () => setEditing(true) },
        { label: 'Reply', disabled: note.resolved, onPick: () => (pickNote(editor, note.id), setReplying(true)) },
        { label: note.resolved ? 'Reopen' : 'Resolve', onPick: () => changeNote(editor, note.id, { resolved: !note.resolved || undefined }) },
        { label: 'Go to its words', disabled: gone, onPick: () => editor.chain().setTextSelection({ from: note.from, to: note.to }).scrollIntoView().focus().run() },
        { separator: true },
        { label: 'Delete note', danger: true, onPick: () => deleteNote(editor, note.id) },
      ],
      opener,
    );

  return (
    <article
      ref={refEl}
      className={`chef-card${active ? ' on' : ''}${note.resolved ? ' resolved' : ''}`}
      style={{ visibility: 'hidden' }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest('button, textarea')) return;
        pickNote(editor, note.id);
      }}
      onContextMenu={(e) => {
        if ((e.target as Element).closest('textarea')) return;
        e.preventDefault();
        menu(e.clientX, e.clientY);
      }}
    >
      <header className="chef-card-head">
        <span className="chef-avatar" aria-hidden="true">
          {(writer.trim()[0] ?? 'Y').toUpperCase()}
        </span>
        <span className="chef-who">{writer}</span>
        <time className="chef-when" dateTime={note.at}>
          {note.resolved ? 'Resolved' : whenWritten(note.at)}
        </time>
        <button
          className="chef-more"
          aria-label="Note menu"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            menu(r.left, r.bottom + 4, e.currentTarget);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M5 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4zM12 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4zM19 10a2 2 0 1 1 0 4 2 2 0 1 1 0-4z" />
          </svg>
        </button>
      </header>
      {gone && <div className="chef-gone">The words this note was on have gone.</div>}
      {editing ? (
        <div className="chef-edit">
          <textarea
            ref={(el) => {
              // Focused as it appears, so the first keys typed land in it.
              if (el && !area.current) el.focus({ preventScroll: true });
              area.current = el;
              grow(el);
            }}
            className="chef-field"
            rows={2}
            placeholder="Write a note…"
            aria-label="Note"
            value={draft}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              grow(e.currentTarget);
            }}
            onKeyDown={(e) => keys(e, save, cancel)}
          />
          <div className="chef-actions">
            <button className="chef-act" onClick={cancel}>
              Cancel
            </button>
            <button className="chef-act main" onClick={save} disabled={!draft.trim() && !note.text}>
              {note.text ? 'Save' : 'Post'}
            </button>
          </div>
        </div>
      ) : (
        <div className="chef-text" onDoubleClick={() => !note.resolved && setEditing(true)}>
          {note.text}
        </div>
      )}
      {!note.resolved &&
        note.replies?.map((r) => (
          <div key={r.id} className="chef-reply">
            <div className="chef-card-head">
              <span className="chef-avatar small" aria-hidden="true">
                {(writer.trim()[0] ?? 'Y').toUpperCase()}
              </span>
              <span className="chef-who">{writer}</span>
              <time className="chef-when" dateTime={r.at}>
                {whenWritten(r.at)}
              </time>
              <button className="chef-more" aria-label="Delete reply" title="Delete reply" onClick={() => changeNote(editor, note.id, (n) => ({ replies: (n.replies ?? []).filter((x) => x.id !== r.id) }))}>
                ×
              </button>
            </div>
            <div className="chef-text">{r.text}</div>
          </div>
        ))}
      {active && !editing && !note.resolved && (
        replying ? (
          <div className="chef-edit">
            <textarea
              ref={(el) => {
                if (el && !replyArea.current) el.focus({ preventScroll: true });
                replyArea.current = el;
                grow(el);
              }}
              className="chef-field"
              rows={1}
              placeholder="Reply…"
              aria-label="Reply"
              value={reply}
              onChange={(e) => {
                setReply(e.currentTarget.value);
                grow(e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  return postReply();
                }
                keys(e, postReply, () => (setReply(''), setReplying(false)));
              }}
            />
          </div>
        ) : (
          <div className="chef-actions start">
            <button className="chef-act" onClick={() => setReplying(true)}>
              Reply
            </button>
            <button className="chef-act" onClick={() => changeNote(editor, note.id, { resolved: true })}>
              Resolve
            </button>
          </div>
        )
      )}
    </article>
  );
}
