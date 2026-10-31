import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Editor } from '@tiptap/core';
import { type FoundIssue, applySuggestion, aroundIssue, issueAt, selectIssue } from '../proofread/plugin';
import { SEASONINGS, fixText, ownerOf, remark } from '../proofread/remarks';
import { type Proofreader } from '../proofread/useProofreader';
import { Face } from './Faces';
import { placeAt } from './zoom';

/** The replacements for an issue: a near-miss name's own, or the dictionary's in the order that fits the words around it, asked for only when shown. */
export function useSuggestions(editor: Editor | null, issue: FoundIssue | null, proof: Proofreader): string[] | null {
  const [found, setFound] = useState<string[] | null>(null);
  const around = editor && issue?.issue.rule === 'spelling' ? aroundIssue(editor.state.doc, issue) : undefined;
  // Only the words nearby matter, so typing elsewhere doesn't ask again.
  const aroundKey = around ? `${around.before}\u0000${around.after}` : '';
  useEffect(() => {
    setFound(null);
    if (!issue) return;
    if (issue.issue.suggestions.length > 0 || issue.issue.rule !== 'spelling') return setFound(issue.issue.suggestions);
    let live = true;
    proof.suggest(issue.word, around).then(
      (s) => live && setFound(s),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [issue?.word, aroundKey, issue?.issue.rule, issue?.issue.suggestions.join('\n')]);
  return found;
}

/**
 * The card that opens from an underline in the text. It sits by the word on
 * a desktop and rises from the bottom of the screen on a phone.
 */
export function IssueCard({ editor, proof, request }: { editor: Editor | null; proof: Proofreader; request?: { issue: FoundIssue; at: number } | null }) {
  // `keyboard`: opened with F7, so the keyboard goes into the card, ready for Enter.
  const [open, setOpen] = useState<{ issue: FoundIssue; rect: DOMRect; keyboard?: boolean } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const down = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      // Hard and sticky sentences are only tinted; they are listed in Seasonings rather than opened by every click.
      const el = e.target instanceof Element ? e.target.closest('.cb-issue:not(.cb-issue-sentence)') : null;
      if (!el || e.button !== 0 || !editor.view.dom.contains(el)) return setOpen(null);
      const issue = issueAt(editor.state, editor.view.posAtDOM(el, 0));
      setOpen(issue ? { issue, rect: el.getBoundingClientRect() } : null);
    };
    const key = (e: KeyboardEvent) => {
      if (box.current?.contains(e.target as Node)) {
        if (e.key === 'Escape') {
          setOpen(null);
          editor.commands.focus();
        }
        return;
      }
      setOpen(null);
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [editor]);

  // F7 and Shift+F7: the issue is selected in the text and its card opens by it.
  useEffect(() => {
    if (!editor || !request) return;
    const { issue } = request;
    selectIssue(editor, issue);
    const a = editor.view.coordsAtPos(issue.from);
    const b = editor.view.coordsAtPos(issue.to);
    setOpen({ issue, rect: new DOMRect(a.left, a.top, Math.max(b.right - a.left, 1), Math.max(b.bottom, a.bottom) - a.top), keyboard: true });
  }, [request?.at]);

  useLayoutEffect(() => {
    if (!open || !box.current) return setPos(null);
    const { width, height } = box.current.getBoundingClientRect();
    const r = open.rect;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const top = r.bottom + 6 + height > window.innerHeight - 12 ? Math.max(12, r.top - 6 - height) : r.bottom + 6;
    setPos(placeAt(box.current.parentElement, { left, top }));
  }, [open]);

  if (!open || !editor) return null;
  return <IssueBody editor={editor} issue={open.issue} proof={proof} box={box} pos={pos} keyboard={!!open.keyboard} onDone={() => setOpen(null)} />;
}

/** What the card says: whose issue it is, their remark, the fix as text, and the same buttons every time. */
function IssueBody({ editor, issue, proof, box, pos, keyboard, onDone }: { editor: Editor; issue: FoundIssue; proof: Proofreader; box: React.RefObject<HTMLDivElement | null>; pos: { left: number; top: number } | null; keyboard: boolean; onDone: () => void }) {
  const suggestions = useSuggestions(editor, issue, proof);
  const owner = ownerOf(issue.issue);
  const [fix, ...others] = suggestions ?? [];
  // Opened from the keyboard: Fix takes the keyboard once there is a fix (spelling ones arrive a moment later),
  // or the first button there is when there's none. Escape goes back to the text.
  useEffect(() => {
    if (!keyboard || suggestions === null) return;
    const card = box.current;
    (card?.querySelector<HTMLButtonElement>('.btn-primary:not(:disabled)') ?? card?.querySelector<HTMLButtonElement>('.issue-more button, .remove'))?.focus({ preventScroll: true });
  }, [keyboard, suggestions, issue.from]);
  const done = (fn: () => void) => () => {
    fn();
    onDone();
  };
  return (
    <div
      className="issue-card"
      role="dialog"
      aria-label={SEASONINGS.find((s) => s.id === owner)!.name}
      ref={box}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <div className="bubble-row">
        <Face id={owner} size={22} />
        <div className="bubble">{remark(issue.issue, issue.word)}</div>
        <button className="remove" aria-label="Remove for good" title="Remove for good" onClick={done(() => proof.ignore(issue, 'once'))}>
          ✕
        </button>
      </div>
      <div className="fix">
        <span className="sug">{fix !== undefined && <>→ <strong>{fixText(issue.word, fix)}</strong></>}</span>
        <button className="btn btn-primary" disabled={fix === undefined} onClick={done(() => fix !== undefined && applySuggestion(editor, issue, fix))}>
          Fix
        </button>
      </div>
      {(others.length > 0 || issue.issue.rule === 'spelling') && (
        <div className="issue-more">
          {others.slice(0, 4).map((s) => (
            <button key={s} className="text-link" onClick={done(() => applySuggestion(editor, issue, s))}>
              {fixText(issue.word, s)}
            </button>
          ))}
          {issue.issue.rule === 'spelling' && (
            <button className="text-link" onClick={done(() => proof.addWord(issue.word))}>
              Add to dictionary
            </button>
          )}
        </div>
      )}
    </div>
  );
}
