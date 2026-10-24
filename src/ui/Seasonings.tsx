import { useEffect, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type Node as PMNode } from '@tiptap/pm/model';
import { isDialogueFocus, setDialogueFocus } from '../editor/seasonings';
import { type FoundIssue, applySuggestion, issuesOf, selectIssue } from '../proofread/plugin';
import { SEASONINGS, SPICE, type SeasoningId, fixText, gradeRemark, ownerOf, remark, spiceOf, talkRemark } from '../proofread/remarks';
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
  /** The open page's id, for remarks that belong to it. */
  pageId: string;
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

export function Seasonings({ editor, pageId, proof, chosen, onChosen, tracked, onTrack, onUntrack, gone, onGone, onClose, onIssueMenu }: Props) {
  // A new work starts with nothing picked, so the picker shows until Done.
  const [picking, setPicking] = useState(chosen.length === 0);
  useEffect(() => {
    if (chosen.length === 0) setPicking(true);
  }, [chosen.length]);
  const page = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? { issues: issuesOf(editor.state), grade: textGrade(paragraphs(editor.state.doc)), dim: isDialogueFocus(editor.state) } : null),
  });
  if (!editor || !page) return null;

  const showPicker = picking;
  const move = (id: SeasoningId, to: 'top' | 'up' | 'down' | 'bottom') => {
    const rest = chosen.filter((c) => c !== id);
    const at = chosen.indexOf(id);
    const index = to === 'top' ? 0 : to === 'bottom' ? rest.length : to === 'up' ? Math.max(0, at - 1) : Math.min(rest.length, at + 1);
    onChosen([...rest.slice(0, index), id, ...rest.slice(index)]);
  };
  const toggle = (id: SeasoningId) => onChosen(chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  const mine = (id: SeasoningId) => page.issues.filter((i) => ownerOf(i.issue) === id);
  const gradeKey = `sally:${pageId}:${page.grade.grade}`;
  const graded = page.grade.words >= MIN_GRADE_WORDS && !gone.includes(gradeKey);

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
              <button key={s.id} className="tile" aria-pressed={chosen.includes(s.id)} onClick={() => toggle(s.id)}>
                {chosen.includes(s.id) && (
                  <span className="tile-tick" aria-hidden="true">
                    ✓
                  </span>
                )}
                <Face id={s.id} />
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
        <div className="panel-list">
          {chosen.map((id, at) => {
            const who = SEASONINGS.find((s) => s.id === id)!;
            const issues = mine(id);
            const count = id === 'daniel' ? tracked.length : id === 'sally' ? issues.length + (graded ? 1 : 0) : issues.length;
            return (
              <section className="sc" aria-label={who.name} key={id}>
                <div className="sc-head">
                  <Face id={id} size={30} />
                  <span className="sub-h">{who.name}</span>
                  {count > 0 && <span className="count">{count}</span>}
                  <span className="handles">
                    <Handle label="Move to top" disabled={at === 0} onClick={() => move(id, 'top')} d="M5 4h14M12 20V9M7 13l5-5 5 5" />
                    <Handle label="Move up" disabled={at === 0} onClick={() => move(id, 'up')} d="M12 19V6M6 11l6-6 6 6" />
                    <Handle label="Move down" disabled={at === chosen.length - 1} onClick={() => move(id, 'down')} d="M12 5v13M6 13l6 6 6-6" />
                    <Handle label="Move to bottom" disabled={at === chosen.length - 1} onClick={() => move(id, 'bottom')} d="M5 20h14M12 4v11M7 11l5 5 5-5" />
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
                {id === 'sally' && graded && (
                  <div className="say">
                    <Bubble id="sally" text={gradeRemark(page.grade.grade)} onRemove={() => onGone(gradeKey)} />
                    <div className="fix">
                      <span className="sug" />
                      <button className="btn btn-primary" disabled>
                        Fix
                      </button>
                      <button className="btn" disabled={issues.length === 0} onClick={() => issues[0] && selectIssue(editor, issues[0])}>
                        Show
                      </button>
                    </div>
                  </div>
                )}

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

function Handle({ label, d, disabled, onClick }: { label: string; d: string; disabled: boolean; onClick: () => void }) {
  return (
    <button className="handle" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
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
  const suggestions = useSuggestions(issue, proof);
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
      <span className={`mark-${issue.issue.kind}`}>{issue.word}</span>
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
