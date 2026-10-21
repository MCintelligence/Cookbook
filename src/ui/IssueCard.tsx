import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Editor } from '@tiptap/core';
import { type FoundIssue, applySuggestion, issueAt } from '../proofread/plugin';
import { type Proofreader } from '../proofread/useProofreader';

const KIND_LABEL = { spelling: 'Spelling', grammar: 'Grammar', style: 'Style' } as const;

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

/** How a fix reads on its button, including the ones that only change spaces. */
export function fixLabel(problem: string, fix: string): string {
  if (fix === '') return problem.trim() ? `Remove “${problem.trim()}”` : 'Remove the space';
  if (fix.trim() === '') return fix.length === 1 ? 'One space' : 'Spaces';
  return fix;
}

/** What can be done about an issue: its fixes, then adding the word to the dictionary or ignoring it. */
export function IssueActions({ editor, issue, proof, onDone }: { editor: Editor; issue: FoundIssue; proof: Proofreader; onDone?: () => void }) {
  const suggestions = useSuggestions(issue, proof);
  const [why, setWhy] = useState(false);
  const done = (fn: () => void) => () => {
    fn();
    onDone?.();
  };
  return (
    <>
      <div className="issue-fixes">
        {suggestions === null && <span className="issue-quiet">Finding suggestions…</span>}
        {suggestions?.length === 0 && issue.issue.kind === 'spelling' && <span className="issue-quiet">No suggestions.</span>}
        {suggestions?.map((s) => (
          <button key={s} className="issue-fix" onClick={done(() => applySuggestion(editor, issue, s))}>
            {fixLabel(issue.word, s)}
          </button>
        ))}
      </div>
      <div className="issue-actions">
        {issue.issue.rule === 'spelling' && (
          <button className="pill" onClick={done(() => proof.addWord(issue.word))}>
            Add to dictionary
          </button>
        )}
        <button className="pill" onClick={done(() => proof.ignore(issue))}>
          Ignore
        </button>
        {issue.issue.why && (
          <button className="pill" aria-expanded={why} onClick={() => setWhy(!why)}>
            Why?
          </button>
        )}
      </div>
      {why && <p className="issue-why">{issue.issue.why}</p>}
    </>
  );
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
    setPos({ left, top });
  }, [open]);

  if (!open || !editor) return null;
  const { issue } = open;
  return (
    <div
      className={`issue-card issue-${issue.issue.kind}`}
      role="dialog"
      aria-label={`${KIND_LABEL[issue.issue.kind]} suggestion`}
      ref={box}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <span className="issue-kind">{issue.issue.rule === 'name' ? 'Story name' : KIND_LABEL[issue.issue.kind]}</span>
      <p className="issue-message">{issue.issue.message}</p>
      <IssueActions editor={editor} issue={issue} proof={proof} onDone={() => setOpen(null)} />
    </div>
  );
}
