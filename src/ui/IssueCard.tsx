import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Editor } from '@tiptap/core';
import { type FoundIssue, applySuggestion, issueAt } from '../proofread/plugin';
import { SEASONINGS, fixText, ownerOf, remark } from '../proofread/remarks';
import { type Proofreader } from '../proofread/useProofreader';
import { Face } from './Faces';
import { placeAt } from './zoom';

/** The replacements for an issue: a near-miss name's own, or the dictionary's, asked for only when shown. */
export function useSuggestions(issue: FoundIssue | null, proof: Proofreader): string[] | null {
  const [found, setFound] = useState<string[] | null>(null);
  useEffect(() => {
    setFound(null);
    if (!issue) return;
    if (issue.issue.suggestions.length > 0 || issue.issue.rule !== 'spelling') return setFound(issue.issue.suggestions);
    let live = true;
    proof.suggest(issue.word).then(
      (s) => live && setFound(s),
      () => live && setFound([]),
    );
    return () => {
      live = false;
    };
  }, [issue?.word, issue?.issue.rule, issue?.issue.suggestions.join('\n')]);
  return found;
}

/**
 * The card that opens from an underline in the text. It sits by the word on
 * a desktop and rises from the bottom of the screen on a phone.
 */
export function IssueCard({ editor, proof }: { editor: Editor | null; proof: Proofreader }) {
  const [open, setOpen] = useState<{ issue: FoundIssue; rect: DOMRect } | null>(null);
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

  useLayoutEffect(() => {
    if (!open || !box.current) return setPos(null);
    const { width, height } = box.current.getBoundingClientRect();
    const r = open.rect;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const top = r.bottom + 6 + height > window.innerHeight - 12 ? Math.max(12, r.top - 6 - height) : r.bottom + 6;
    setPos(placeAt(box.current.parentElement, { left, top }));
  }, [open]);

  if (!open || !editor) return null;
  return <IssueBody editor={editor} issue={open.issue} proof={proof} box={box} pos={pos} onDone={() => setOpen(null)} />;
}

/** What the card says: whose issue it is, their remark, the fix as text, and the same buttons every time. */
function IssueBody({ editor, issue, proof, box, pos, onDone }: { editor: Editor; issue: FoundIssue; proof: Proofreader; box: React.RefObject<HTMLDivElement | null>; pos: { left: number; top: number } | null; onDone: () => void }) {
  const suggestions = useSuggestions(issue, proof);
  const owner = ownerOf(issue.issue);
  const [fix, ...others] = suggestions ?? [];
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
