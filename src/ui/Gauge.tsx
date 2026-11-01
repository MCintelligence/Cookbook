import { METERS, type SeasoningId } from '../proofread/remarks';

/** A seasoning's meter: its level and what it read, five steps from one end to the other. */
/** `tasting`: the page is still being checked for the first time, so there's no reading yet. */
export function Gauge({ id, reading, tasting = false }: { id: SeasoningId; reading: { at: number; detail: string } | null; tasting?: boolean }) {
  const { measure, steps, ends } = METERS[id];
  const at = reading?.at ?? -1;
  return (
    <div
      className={`gauge${tasting ? ' is-tasting' : ''}`}
      aria-busy={tasting || undefined}
      role="meter"
      aria-label={measure}
      aria-valuemin={0}
      aria-valuemax={steps.length - 1}
      aria-valuenow={Math.max(at, 0)}
      aria-valuetext={reading ? `${steps[at]!.level}, ${reading.detail}` : tasting ? 'Still tasting the page' : 'Not enough to read yet'}
    >
      <div className="gauge-row">
        <span className="gauge-level">{reading ? steps[at]!.level : tasting ? 'Tasting…' : '—'}</span>
        {reading && <span className="gauge-detail">{reading.detail}</span>}
      </div>
      <div className="gauge-bar" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={s.level} className={`gauge-step gauge-${i}${i <= at ? ' is-on' : ''}`} />
        ))}
      </div>
      <div className="gauge-ends" aria-hidden="true">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}
