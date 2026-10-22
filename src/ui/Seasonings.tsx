import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { type Node as PMNode } from '@tiptap/pm/model';
import {
  addNoteAnchor,
  deleteFootnote,
  dialogueStats,
  footnotes,
  insertFootnote,
  isDialogueFocus,
  noteAnchors,
  removeNoteAnchor,
  selectFootnote,
  selectRange,
  setDialogueFocus,
  setFootnoteText,
  setTodoChecked,
  todos,
  type SeasoningsRequest,
} from '../editor/seasonings';
import { DIALECTS, type IssueKind } from '../proofread/check';
import { RULE_GROUPS } from '../proofread/rules';
import { type FoundIssue, issuesOf, selectIssue } from '../proofread/plugin';
import { textGrade } from '../proofread/style';
import { type Proofreader } from '../proofread/useProofreader';
import { IssueActions } from './IssueCard';

export type SeasoningsTab = 'all' | 'proofread' | 'notes' | 'footnotes' | 'dialogue';

/** Left to right in the tabs, top to bottom under All. */
const TABS: { id: SeasoningsTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'proofread', label: 'Proofread' },
  { id: 'notes', label: 'Notes' },
  { id: 'footnotes', label: 'Footnotes' },
  { id: 'dialogue', label: 'Dialogue' },
];

export type Notes = Record<string, string>;

interface Props {
  editor: Editor | null;
  notes: Notes;
  onNotesChange: (notes: Notes) => void;
  tab: SeasoningsTab;
  onTab: (tab: SeasoningsTab) => void;
  /** The note or footnote to bring into view, set when one is added or clicked in the text. */
  request: (SeasoningsRequest & { at: number }) | null;
  onRequest: (r: SeasoningsRequest) => void;
  onClose: () => void;
  proof: Proofreader;
  /** A right-click on an issue's card. */
  onIssueMenu?: (issue: FoundIssue, x: number, y: number) => void;
}

/** How many things Seasonings has for the writer, for the badge on its button. */
export function useSeasoningsCount(editor: Editor | null, notes: Notes): number {
  const anchored = useEditorState({
    editor,
    selector: ({ editor }) => (editor ? { ids: noteAnchors(editor.state.doc).map((a) => a.id), footnotes: footnotes(editor.state.doc).length } : null),
  });
  if (!anchored) return 0;
  return new Set([...Object.keys(notes), ...anchored.ids]).size + anchored.footnotes;
}

export function Seasonings({ editor, notes, onNotesChange, tab, onTab, request, onRequest, onClose, proof, onIssueMenu }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<IssueKind | null>(null);
  const scene = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return null;
      const { doc } = editor.state;
      return {
        anchors: noteAnchors(doc).map(({ id, quote, from, to }) => ({ id, quote, from, to })),
        footnotes: footnotes(doc),
        todos: todos(doc),
        dialogue: dialogueStats(doc),
        focus: isDialogueFocus(editor.state),
        issues: issuesOf(editor.state),
        grade: textGrade(paragraphs(doc)),
      };
    },
  });

  useEffect(() => {
    if (!request) return;
    const key = request.tab === 'notes' ? `note-${request.id}` : `footnote-${request.index}`;
    // Wait a frame so a note or footnote that was just added is on screen.
    const frame = requestAnimationFrame(() => {
      const card = panel.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
      card?.scrollIntoView({ block: 'nearest' });
      card?.querySelector('textarea')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);

  if (!editor || !scene) return null;

  const anchoredIds = new Set(scene.anchors.map((a) => a.id));
  const loose = Object.keys(notes).filter((id) => !anchoredIds.has(id));
  const noteCount = scene.anchors.length + loose.length;
  const { dialogueWords, totalWords } = scene.dialogue;
  const share = totalWords > 0 ? Math.round((dialogueWords / totalWords) * 100) : 0;
  const show = (t: SeasoningsTab) => tab === 'all' || tab === t;

  const addNote = () => {
    const id = addNoteAnchor(editor, Object.keys(notes));
    onNotesChange({ ...notes, [id]: '' });
    onRequest({ tab: 'notes', id });
  };
  const deleteNote = (id: string) => {
    removeNoteAnchor(editor, id);
    const { [id]: _gone, ...rest } = notes;
    onNotesChange(rest);
  };
  const addFootnote = () => onRequest({ tab: 'footnotes', index: insertFootnote(editor) });

  return (
    <aside className="seasonings" aria-label="Seasonings" ref={panel}>
      <div className="seas-head">
        <span className="seas-title">Seasonings</span>
        <span className="seas-sub">Everything for reviewing</span>
        <button className="seas-close" aria-label="Close Seasonings" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="seas-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {show('proofread') && (
        <Section title="Proofread" count={scene.issues.length}>
          <div className="seas-card seas-proof-settings">
            <div className="seas-dialect" role="radiogroup" aria-label="Spelling">
              {DIALECTS.map((d) => (
                <button key={d.id} role="radio" aria-checked={proof.dialect === d.id} onClick={() => proof.setDialect(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
            {scene.grade.sentences > 0 && (
              <span className="seas-grade">
                <span>
                  Readability: <strong>grade {scene.grade.grade}</strong>
                </span>
                <span className="seas-hint">{gradeNote(scene.grade.grade)}</span>
              </span>
            )}
            <span className="seas-hint">Spelling, grammar and style are checked on this device. Story names from the Pantry are always spelt right.</span>
          </div>
          {scene.issues.length === 0 && <div className="seas-card seas-quiet">Nothing to fix here. Spelling, grammar and style all look good.</div>}
          {scene.issues.length > 0 && (
            <div className="seas-kinds" role="group" aria-label="Show">
              {KINDS.map((k) => {
                const n = scene.issues.filter((i) => i.issue.kind === k.id).length;
                return (
                  <button
                    key={k.id}
                    className={`seas-kind issue-${k.id}`}
                    aria-pressed={kindFilter === k.id}
                    disabled={n === 0}
                    onClick={() => setKindFilter(kindFilter === k.id ? null : k.id)}
                  >
                    <strong>{n}</strong> {k.label}
                  </button>
                );
              })}
            </div>
          )}
          {scene.issues.filter((i) => !kindFilter || i.issue.kind === kindFilter).map((i) => {
            const key = issueKey(i);
            return (
              <div
                className={`seas-card seas-issue issue-${i.issue.kind}`}
                key={key}
                onContextMenu={(e) => {
                  if (!onIssueMenu) return;
                  e.preventDefault();
                  onIssueMenu(i, e.clientX, e.clientY);
                }}
              >
                <button
                  className="seas-quote"
                  aria-expanded={openIssue === key}
                  onClick={() => {
                    setOpenIssue(openIssue === key ? null : key);
                    selectIssue(editor, i);
                  }}
                >
                  <span className="seas-issue-word">{shortQuote(i.word)}</span> {i.issue.message}
                </button>
                {openIssue === key && <IssueActions editor={editor} issue={i} proof={proof} onDone={() => setOpenIssue(null)} />}
              </div>
            );
          })}
          <details className="seas-card seas-dictionary">
            <summary>Checks</summary>
            {RULE_GROUPS.map((g) => (
              <fieldset className="seas-rules" key={g.title}>
                <legend>{g.title}</legend>
                {g.rules.map((r) => (
                  <label className="seas-todo" key={r.id}>
                    <input type="checkbox" checked={!proof.off.includes(r.id)} onChange={(e) => proof.setRuleOn(r.id, e.target.checked)} />
                    <span>{r.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <span className="seas-hint">
              Grammar and style are checked while Seasonings is open; spelling all the time.
              {proof.ignoredCount > 0 && (
                <>
                  {' '}
                  {proof.ignoredCount} ignored.{' '}
                  <button className="seas-link" onClick={proof.clearIgnored}>
                    Show them again
                  </button>
                </>
              )}
            </span>
          </details>
          <details className="seas-card seas-dictionary">
            <summary>
              Your dictionary · {proof.words.length} {proof.words.length === 1 ? 'word' : 'words'}
            </summary>
            {proof.words.length === 0 ? (
              <span className="seas-hint">Words you add from a spelling card are kept in dictionary.txt in the book folder.</span>
            ) : (
              <div className="seas-words">
                {[...proof.words].sort((a, b) => a.localeCompare(b, 'en')).map((w) => (
                  <span className="seas-word" key={w}>
                    {w}
                    <button aria-label={`Remove ${w} from your dictionary`} onClick={() => proof.removeWord(w)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </details>
        </Section>
      )}

      {show('notes') && (
        <Section title="Notes" count={noteCount} action={<button className="ghost" onClick={addNote}>+ Add note</button>}>
          {noteCount === 0 && <div className="seas-card seas-quiet">Select some words and press ⌘⌥M to leave yourself a note.</div>}
          {scene.anchors.map((a) => (
            <div className="seas-card" key={a.id} data-key={`note-${a.id}`}>
              <button className="seas-quote" onClick={() => selectRange(editor, a.from, a.to)}>
                On “{a.quote.trim()}”
              </button>
              <NoteText value={notes[a.id] ?? ''} onChange={(text) => onNotesChange({ ...notes, [a.id]: text })} />
              <button className="seas-delete" onClick={() => deleteNote(a.id)}>
                Delete note
              </button>
            </div>
          ))}
          {loose.map((id) => (
            <div className="seas-card" key={id} data-key={`note-${id}`}>
              <span className="seas-quote">On the whole scene</span>
              <NoteText value={notes[id] ?? ''} onChange={(text) => onNotesChange({ ...notes, [id]: text })} />
              <button className="seas-delete" onClick={() => deleteNote(id)}>
                Delete note
              </button>
            </div>
          ))}
          {scene.todos.length > 0 && (
            <div className="seas-card">
              <span className="seas-quote">Scene to-do</span>
              {scene.todos.map((t) => (
                <label className="seas-todo" key={t.pos}>
                  <input type="checkbox" checked={t.checked} onChange={(e) => setTodoChecked(editor, t.pos, e.target.checked)} />
                  <span className={t.checked ? 'is-done' : ''}>{t.text || 'Empty item'}</span>
                </label>
              ))}
              <span className="seas-hint">Typed as “-TD ” on a new line</span>
            </div>
          )}
        </Section>
      )}

      {show('footnotes') && (
        <Section
          title="Footnotes"
          count={scene.footnotes.length}
          action={<button className="ghost" onClick={addFootnote}>+ Add at cursor</button>}
        >
          {scene.footnotes.length === 0 && <div className="seas-card seas-quiet">Press ⌘⌥F to add a footnote where the cursor is.</div>}
          {scene.footnotes.map((f, i) => (
            <div className="seas-card" key={f.pos} data-key={`footnote-${i}`}>
              <button className="seas-quote" onClick={() => selectFootnote(editor, i)}>
                <sup>{i + 1}</sup> Footnote {i + 1}
              </button>
              <NoteText value={f.text} placeholder="Footnote text" onChange={(text) => setFootnoteText(editor, i, text)} />
              <button className="seas-delete" onClick={() => deleteFootnote(editor, i)}>
                Delete footnote
              </button>
            </div>
          ))}
        </Section>
      )}

      {show('dialogue') && (
        <Section title="Dialogue" detail={`${share}% of this scene`}>
          <div className="seas-card">
            <span className="seas-meter" aria-hidden="true">
              <span style={{ width: `${share}%` }} />
            </span>
            <span className="seas-hint">
              {dialogueWords.toLocaleString('en')} of {totalWords.toLocaleString('en')} words are spoken. Narration fades so only dialogue stands out.
            </span>
            <button className="seas-toggle" aria-pressed={scene.focus} onClick={() => setDialogueFocus(editor, !scene.focus)}>
              {scene.focus ? 'Show everything again' : 'Dim everything but dialogue'}
            </button>
          </div>
        </Section>
      )}
    </aside>
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

const gradeNote = (grade: number) =>
  grade <= 6 ? 'Easy to read. Most novels sit between grades 4 and 8.' : grade <= 9 ? 'Comfortable for most readers.' : 'Hard going. Shorter sentences and plainer words will bring it down.';

/** A whole sentence is too long for the list; its first words are enough to find it. */
const shortQuote = (text: string) => {
  const t = text.trim();
  if (!t) return 'Space';
  const ws = t.split(/\s+/);
  return ws.length > 6 ? `${ws.slice(0, 6).join(' ')}…` : t;
};

const KINDS: { id: IssueKind; label: string }[] = [
  { id: 'spelling', label: 'spelling' },
  { id: 'grammar', label: 'grammar' },
  { id: 'style', label: 'style' },
];

const issueKey = (i: FoundIssue) => `${i.from}:${i.issue.rule}:${i.word}`;

function Section({ title, count, detail, action, children }: { title: string; count?: number; detail?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="seas-section" aria-label={title}>
      <div className="seas-label">
        <span>{title}</span>
        <span className="seas-label-end">
          {action}
          {detail ?? (count !== undefined && count > 0 ? count : '')}
        </span>
      </div>
      {children}
    </section>
  );
}

function NoteText({ value, placeholder = 'Write a note to yourself', onChange }: { value: string; placeholder?: string; onChange: (text: string) => void }) {
  return <textarea className="seas-text" rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}
