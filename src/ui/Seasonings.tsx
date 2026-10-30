import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type Node as PMNode } from '@tiptap/pm/model';
import { isDialogueFocus, setDialogueFocus } from '../editor/seasonings';
import { type FoundIssue, applySuggestion, bracketsFor, issuesOf, selectIssue } from '../proofread/plugin';
import { SEASONINGS, SPICE, type SeasoningId, fixText, ownerOf, remark, spiceOf, talkRemark } from '../proofread/remarks';
import { textGrade } from '../proofread/style';
import { type Proofreader } from '../proofread/useProofreader';
import { Face } from './Faces';
import { useSuggestions } from './IssueCard';

/** A page or book Daniel keeps an eye on, with how much of it is spoken once counted. */
export interface Tracked {
  path: string;
  title: string;
  /** Percent of its words inside quotes, or null while it is being counted. */
  share: number | null;
}

interface Props {
  editor: Editor | null;
  proof: Proofreader;
  chosen: SeasoningId[];
  onChosen: (chosen: SeasoningId[]) => void;
  tracked: Tracked[];
  /** Opens the list of pages and books Daniel could track, at the pointer. */
  onTrack: (x: number, y: number) => void;
  onUntrack: (path: string) => void;
  /** Remarks removed for good, and a way to remove one. */
  gone: string[];
  onGone: (key: string) => void;
  onClose: () => void;
  /** A right-click on an issue. */
  onIssueMenu?: (issue: FoundIssue, x: number, y: number) => void;
}

/** A grade level from a few words means nothing, so Sally waits for a paragraph or two. */
const MIN_GRADE_WORDS = 50;
const LONG_PRESS_MS = 400;

export function Seasonings({ editor, proof, chosen, onChosen, tracked, onTrack, onUntrack, gone, onGone, onClose, onIssueMenu }: Props) {
  // A new work starts with nothing picked, so the picker shows until Done.
  const [picking, setPicking] = useState(chosen.length === 0);
  useEffect(() => {
    if (chosen.length === 0) setPicking(true);
  }, [chosen.length]);
  // The seasoning being dragged by its head, and where it would land among the others.
  const [drag, setDrag] = useState<{ id: SeasoningId; index: number | null } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const page = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? { issues: issuesOf(editor.state), grade: textGrade(paragraphs(editor.state.doc)), dim: isDialogueFocus(editor.state) } : null),
  });
  if (!editor || !page) return null;

  const showPicker = picking;
  const move = (id: SeasoningId, to: 'top' | 'up' | 'down' | 'bottom') => {
    // The card is drawn again in its new place; the keyboard stays on the same button or card.
    const held = document.activeElement;
    if (held instanceof HTMLElement && list.current?.contains(held)) requestAnimationFrame(() => held.isConnected && held.focus({ preventScroll: true }));
    const rest = chosen.filter((c) => c !== id);
    const at = chosen.indexOf(id);
    const index = to === 'top' ? 0 : to === 'bottom' ? rest.length : to === 'up' ? Math.max(0, at - 1) : Math.min(rest.length, at + 1);
    onChosen([...rest.slice(0, index), id, ...rest.slice(index)]);
  };
  const remove = (id: SeasoningId) => onChosen(chosen.filter((c) => c !== id));
  /** Where a drop at (x, y) would put a card, as an index into the list. */
  const target = (x: number, y: number): number | null => {
    const cards = Array.from(list.current?.querySelectorAll<HTMLElement>('.sc') ?? []);
    if (cards.length === 0) return null;
    const box = list.current!.getBoundingClientRect();
    if (x < box.left - 24 || x > box.right + 24) return null;
    const at = cards.findIndex((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return at === -1 ? cards.length : at;
  };
  const begin = (e: ReactPointerEvent, id: SeasoningId) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const touch = e.pointerType !== 'mouse';
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    // Whatever scrolls the panel, so a long list scrolls while a card is held near its edge.
    let scroller = list.current?.parentElement ?? null;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const start = () => {
      active = true;
      setDrag({ id, index: null });
      navigator.vibrate?.(10);
    };
    // On a touch screen a long press picks the card up, so a plain swipe still scrolls.
    const timer = touch ? window.setTimeout(start, LONG_PRESS_MS) : undefined;
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < (touch ? 8 : 4)) return;
        if (touch) return finish();
        start();
      }
      setDrag({ id, index: target(ev.clientX, ev.clientY) });
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (ev.clientY < box.top + 40) scroller.scrollBy(0, -12);
        else if (ev.clientY > box.bottom - 40) scroller.scrollBy(0, 12);
      }
    };
    const up = (ev: PointerEvent) => {
      const index = active ? target(ev.clientX, ev.clientY) : null;
      finish();
      if (index === null) return;
      const from = chosen.indexOf(id);
      // Dropping just above or below itself leaves it where it is.
      if (index === from || index === from + 1) return;
      const rest = chosen.filter((c) => c !== id);
      const to = index > from ? index - 1 : index;
      onChosen([...rest.slice(0, to), id, ...rest.slice(to)]);
    };
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish();
    const holdStill = (ev: TouchEvent) => active && ev.preventDefault();
    const finish = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchmove', holdStill);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', key);
    window.addEventListener('touchmove', holdStill, { passive: false });
  };
  // No line where a drop would leave the card where it is.
  const from = drag ? chosen.indexOf(drag.id) : -1;
  const dropAt = drag?.index != null && drag.index !== from && drag.index !== from + 1 ? drag.index : null;
  const toggle = (id: SeasoningId) => onChosen(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  const mine = (id: SeasoningId) => page.issues.filter((i) => ownerOf(i.issue) === id);

  return (
    <aside className="panel seasonings" aria-label="Seasonings">
      <div className="panel-head">
        <h2 className="panel-h">Seasonings</h2>
        <span className="panel-tools">
          {!showPicker && (
            <button className="icon-btn icon-text" aria-label="Add a seasoning" onClick={() => setPicking(true)}>
              + Add
            </button>
          )}
          <button className="icon-btn" aria-label="Close Seasonings" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      </div>

      {showPicker ? (
        <>
          <div className="sub-h">Pick your seasonings</div>
          <div className="pick">
            {SEASONINGS.map((s) => (
              // No box: the drawing is grey until picked, then the accent colour.
              <button key={s.id} className="tile" aria-pressed={chosen.includes(s.id)} onClick={() => toggle(s.id)}>
                <Face id={s.id} size={56} />
                <span className="tile-name">{s.name}</span>
                <span className="tile-role">{s.role}</span>
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={chosen.length === 0} onClick={() => setPicking(false)}>
            Done
          </button>
        </>
      ) : (
        <div className={`panel-list${drag ? ' is-sorting' : ''}${dropAt === chosen.length ? ' drop-end' : ''}`} ref={list}>
          {chosen.map((id, at) => {
            const who = SEASONINGS.find((s) => s.id === id)!;
            const issues = mine(id);
            const count = id === 'daniel' ? tracked.length : issues.length;
            const cls = ['sc', drag?.id === id && 'is-dragging', dropAt === at && 'drop-before'].filter(Boolean).join(' ');
            return (
              <section
                className={cls}
                aria-label={who.name}
                key={id}
                // Alt+↑ and Alt+↓ move a seasoning up or down the list (Alt+Home and Alt+End to the ends), as on the Shelf.
                onKeyDown={(e) => {
                  if (!e.altKey || e.ctrlKey || e.metaKey) return;
                  const to = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'Home' ? 'top' : e.key === 'End' ? 'bottom' : null;
                  if (!to) return;
                  e.preventDefault();
                  e.stopPropagation();
                  move(id, to);
                }}
              >
                <div className="sc-head" title="Drag to reorder" onPointerDown={(e) => begin(e, id)}>
                  <Face id={id} size={30} />
                  <span className="sub-h">{who.name}</span>
                  {count > 0 && <span className="count">{count}</span>}
                  <span className="handles">
                    <Handle label="Move to top" disabled={at === 0} onClick={() => move(id, 'top')} d="M5 4h14M12 20V9M7 13l5-5 5 5" />
                    <Handle label="Move up" disabled={at === 0} onClick={() => move(id, 'up')} d="M12 19V6M6 11l6-6 6 6" />
                    <Handle label="Move down" disabled={at === chosen.length - 1} onClick={() => move(id, 'down')} d="M12 5v13M6 13l6 6 6-6" />
                    <Handle label="Move to bottom" disabled={at === chosen.length - 1} onClick={() => move(id, 'bottom')} d="M5 20h14M12 4v11M7 11l5 5 5-5" />
                    <Handle label={`Remove ${who.name}`} className="handle-remove" onClick={() => remove(id)} d="M6 6l12 12M18 6 6 18" />
                  </span>
                </div>

                {id === 'daniel' && (
                  <>
                    <label className="switch-row">
                      <span>Dim narration</span>
                      <input type="checkbox" role="switch" className="switch" checked={page.dim} onChange={(e) => setDialogueFocus(editor, e.target.checked)} />
                    </label>
                    <div className="chips">
                      {tracked.map((t) => (
                        <span className="chip" key={t.path}>
                          {t.title}
                          <button aria-label={`Stop tracking ${t.title}`} onClick={() => onUntrack(t.path)}>
                            ✕
                          </button>
                        </span>
                      ))}
                      <button className="chip chip-add" onClick={(e) => onTrack(e.clientX, e.clientY)}>
                        + Track
                      </button>
                    </div>
                    {tracked.map((t) => {
                      const said = t.share === null ? null : talkRemark(t.share);
                      const key = `daniel:${t.path}:${said}`;
                      return (
                        <div className="say" key={t.path}>
                          <div className="track-row">
                            <span className="track-title">{t.title}</span>
                            <span className="track-share">{t.share === null ? 'Counting…' : `${t.share}% spoken`}</span>
                          </div>
                          <div className="meter" aria-hidden="true">
                            <span style={{ width: `${t.share ?? 0}%` }} />
                          </div>
                          {said && !gone.includes(key) && <Bubble id="daniel" text={said} onRemove={() => onGone(key)} />}
                        </div>
                      );
                    })}
                  </>
                )}

                {id === 'sally' && page.grade.words >= MIN_GRADE_WORDS && <SpiceMeter grade={page.grade.grade} />}
                {issues.map((i) => (
                  <Say key={`${i.from}:${i.issue.rule}:${i.word}`} editor={editor} issue={i} proof={proof} onMenu={onIssueMenu} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/** How hot the page reads, from Mild to Inferno. */
function SpiceMeter({ grade }: { grade: number }) {
  const at = spiceOf(grade);
  return (
    <div className="spice" role="meter" aria-label="Spice" aria-valuemin={0} aria-valuemax={SPICE.length - 1} aria-valuenow={at} aria-valuetext={`${SPICE[at]!.level}, grade ${grade}`}>
      <div className="spice-row">
        <span className="spice-level">{SPICE[at]!.level}</span>
        <span className="spice-grade">Grade {grade}</span>
      </div>
      <div className="spice-bar" aria-hidden="true">
        {SPICE.map((s, i) => (
          <span key={s.level} className={`spice-step spice-${i}${i <= at ? ' is-on' : ''}`} />
        ))}
      </div>
      <div className="spice-ends" aria-hidden="true">
        <span>Mild</span>
        <span>Inferno</span>
      </div>
    </div>
  );
}

function Handle({ label, d, disabled = false, className, onClick }: { label: string; d: string; disabled?: boolean; className?: string; onClick: () => void }) {
  return (
    <button className={className ? `handle ${className}` : 'handle'} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}

function Bubble({ id, text, onRemove }: { id: SeasoningId; text: string; onRemove: () => void }) {
  return (
    <div className="bubble-row">
      <Face id={id} size={22} />
      <div className="bubble">{text}</div>
      <button className="remove" aria-label="Remove for good" title="Remove for good" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** One issue: the character's remark, the words around it, and the same two buttons every time. */
function Say({ editor, issue, proof, onMenu }: { editor: Editor; issue: FoundIssue; proof: Proofreader; onMenu?: (issue: FoundIssue, x: number, y: number) => void }) {
  const suggestions = useSuggestions(editor, issue, proof);
  const fix = suggestions?.[0];
  const sentence = issue.word.length > 40;
  return (
    <div
      className="say"
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(issue, e.clientX, e.clientY);
      }}
    >
      <Bubble id={ownerOf(issue.issue)} text={remark(issue.issue, issue.word)} onRemove={() => proof.ignore(issue, 'once')} />
      {sentence ? (
        <div className="ctx">
          <span className={`mark-${issue.issue.kind}`}>{issue.word.length > LONG ? `${issue.word.slice(0, LONG).replace(/\s\S*$/, '')}…` : issue.word}</span>
        </div>
      ) : (
        <Context editor={editor} issue={issue} />
      )}
      <div className="fix">
        <span className="sug">{fix !== undefined && <>→ <strong>{fixText(issue.word, fix)}</strong></>}</span>
        <button className="btn btn-primary" disabled={fix === undefined} onClick={() => fix !== undefined && applySuggestion(editor, issue, fix)}>
          Fix
        </button>
        <button className="btn" onClick={() => selectIssue(editor, issue)}>
          Show
        </button>
      </div>
    </div>
  );
}

const AROUND = 32;
/** How much of a long sentence its remark quotes. */
const LONG = 90;

/** A few words either side of the issue, from its own paragraph. */
function Context({ editor, issue }: { editor: Editor; issue: FoundIssue }) {
  const { doc } = editor.state;
  if (issue.to > doc.content.size) return null;
  const $from = doc.resolve(issue.from);
  const start = Math.max($from.start(), issue.from - AROUND);
  const end = Math.min($from.end(), issue.to + AROUND);
  // Cut at a space, so no word is shown in half.
  let before = doc.textBetween(start, issue.from, ' ', ' ');
  if (start > $from.start()) before = `…${before.replace(/^\S*\s/, '')}`;
  let after = doc.textBetween(issue.to, end, ' ', ' ');
  if (end < $from.end()) after = `${after.replace(/\s\S*$/, '')}…`;
  return (
    <div className="ctx">
      {before}
      <span className={`mark-${issue.issue.kind}${issue.issue.kind === 'style' && bracketsFor(issue.word)[0] === '『' ? ' mark-word' : ''}`}>{issue.word}</span>
      {after}
    </div>
  );
}

/** Every paragraph's text, for the grade level. */
function paragraphs(doc: PMNode): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    out.push(node.textContent);
    return false;
  });
  return out;
}
