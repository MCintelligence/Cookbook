import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TextSelection } from '@tiptap/pm/state';
import { type Editor } from '@tiptap/react';
import { type Report, type Row, type Section, type Spot } from '../proofread/reports';
import { SEASONINGS } from '../proofread/remarks';
import { Face } from './Faces';
import { Gauge } from './Gauge';

interface Props {
  editor: Editor;
  report: Report;
  /** The Item the report reads. */
  item: string;
  /** Where the report was saved in the Pantry, once it has been; null while saving, or if it couldn't be. */
  saved: string | null;
  onClose: () => void;
}

/** How many jump buttons a row shows before "and n more". */
const SHOWN_SPOTS = 6;
/** Rows shown in a section before "Show all", so a long Item's report opens at once. */
const SHOWN_ROWS = 100;

/**
 * A seasoning's report, in a window over the page: the character's verdict and
 * meter, a few numbers, what to try first, and what they found. Clicking
 * anything found closes the window and selects it on the page.
 */
export function ReportWindow({ editor, report, item, saved, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const before = useRef(document.activeElement as HTMLElement | null);
  const jumped = useRef(false);
  const who = SEASONINGS.find((s) => s.id === report.id)!;

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('.report-close')?.focus();
    return () => {
      // A jump leaves the keyboard on the page; closing otherwise goes back to where it was.
      if (!jumped.current && before.current?.isConnected) before.current.focus({ preventScroll: true });
    };
  }, []);

  const jump = (spot: Spot) => {
    const { doc } = editor.state;
    if (spot.to > doc.content.size) return;
    jumped.current = true;
    onClose();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, spot.from, spot.to)).scrollIntoView());
    editor.view.focus();
  };

  return createPortal(
    <div className="lib-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="lib report"
        role="dialog"
        aria-modal="true"
        aria-label={`${report.title} on ${item || 'Untitled'}`}
        ref={box}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="report-head">
          <Face id={report.id} size={44} />
          <div className="report-title">
            <h2>{report.title}</h2>
            <span>
              {who.name} on “{item || 'Untitled'}”
            </span>
          </div>
          <button className="lib-close report-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="report-verdict">{report.verdict}</div>
        <Gauge id={report.id} reading={report.reading} />

        <dl className="report-stats">
          {report.stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        {report.actions.length > 0 && (
          <section className="report-section">
            <h3>Try this first</h3>
            <ol className="report-actions">
              {report.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          </section>
        )}

        {report.sections.map((s) => (
          <ReportSection key={s.title} section={s} onJump={jump} />
        ))}

        <p className="report-saved" aria-live="polite">
          {saved ? `Saved to Research › Seasoning Reports as “${saved}”.` : 'Saving to Research › Seasoning Reports…'}
        </p>
      </div>
    </div>,
    document.body,
  );
}

function ReportSection({ section, onJump }: { section: Section; onJump: (spot: Spot) => void }) {
  const [all, setAll] = useState(false);
  // A group of notes with nothing in it has no empty line of its own, so it is left out.
  const blank = section.kind === 'rows' ? section.rows.length === 0 : section.kind === 'bars' ? section.bars.length === 0 : section.cells.length === 0;
  if (blank && !section.empty) return null;
  return (
    <section className="report-section">
      <h3>{section.title}</h3>
      {section.note && !blank && <p className="report-note">{section.note}</p>}
      {blank ? (
        <p className="report-empty">{section.empty}</p>
      ) : section.kind === 'rows' ? (
        <>
          <ul className="report-rows">
            {(all ? section.rows : section.rows.slice(0, SHOWN_ROWS)).map((r, i) => (
              <ReportRow key={`${r.label}:${i}`} row={r} onJump={onJump} />
            ))}
          </ul>
          {!all && section.rows.length > SHOWN_ROWS && (
            <button className="btn report-all" onClick={() => setAll(true)}>
              Show all {section.rows.length.toLocaleString('en')}
            </button>
          )}
        </>
      ) : section.kind === 'bars' ? (
        <Bars bars={section.bars} />
      ) : (
        <Strip cells={section.cells} onJump={onJump} />
      )}
    </section>
  );
}

function ReportRow({ row, onJump }: { row: Row; onJump: (spot: Spot) => void }) {
  const first = row.spots[0];
  const more = row.spots.length > 1;
  return (
    <li className="report-row">
      <button className="report-row-main" disabled={!first} onClick={() => first && onJump(first)} title="Show on the page">
        {row.context ? (
          <span className="report-ctx">
            {row.label !== row.context.hit && <strong className="report-label">{row.label} </strong>}
            {row.context.before}
            <mark>{row.context.hit}</mark>
            {row.context.after}
          </span>
        ) : (
          <strong className="report-label">{row.label}</strong>
        )}
        {row.detail && <span className="report-detail">{row.detail}</span>}
        {row.count !== undefined && row.count > 1 && <span className="count">×{row.count}</span>}
      </button>
      {more && (
        <span className="report-spots" aria-label={`${row.spots.length} places`}>
          {row.spots.slice(0, SHOWN_SPOTS).map((spot, i) => (
            <button key={i} className="report-spot" aria-label={`Show place ${i + 1}`} onClick={() => onJump(spot)}>
              {i + 1}
            </button>
          ))}
          {row.spots.length > SHOWN_SPOTS && <span className="report-more">+{row.spots.length - SHOWN_SPOTS}</span>}
        </span>
      )}
    </li>
  );
}

function Bars({ bars }: { bars: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="report-bars" role="list">
      {bars.map((b) => (
        <div className="report-bar" role="listitem" key={b.label} aria-label={`${b.label}: ${b.value}`}>
          <span className="report-bar-label">{b.label}</span>
          <span className="report-bar-track" aria-hidden="true">
            <span style={{ width: `${(b.value / max) * 100}%` }} />
          </span>
          <span className="report-bar-value">{b.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Daniel's talk-and-walk strip: one bar per paragraph, as tall as its share of speech. */
function Strip({ cells, onJump }: { cells: { share: number | null; words: number; spot: Spot }[]; onJump: (spot: Spot) => void }) {
  return (
    <div className="report-strip">
      {cells.map((c, i) => (
        <button
          key={i}
          className="report-strip-cell"
          title={`Paragraph ${i + 1}: ${Math.round((c.share ?? 0) * 100)}% spoken, ${c.words} words`}
          aria-label={`Paragraph ${i + 1}, ${Math.round((c.share ?? 0) * 100)}% spoken`}
          onClick={() => onJump(c.spot)}
        >
          <span style={{ height: `${Math.max(6, (c.share ?? 0) * 100)}%` }} className={c.share ? 'is-spoken' : undefined} />
        </button>
      ))}
    </div>
  );
}
