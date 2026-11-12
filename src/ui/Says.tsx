import { type SeasoningId, SEASONINGS } from '../proofread/remarks';
import { Face } from './Faces';

/**
 * A Seasoning saying something on a phone: their face and a speech bubble that pops in whenever the
 * line changes. Set the Table and the Goals pages speak through it.
 */
export function Says({ who, line }: { who: SeasoningId; line: string }) {
  const name = SEASONINGS.find((x) => x.id === who)!.name;
  return (
    <div className="pt-says">
      <span className="pt-says-face">
        <Face id={who} size={46} />
      </span>
      <p key={line} className="pt-bubble" aria-live="polite">
        <span className="pt-bubble-who">{name}</span>
        {line}
      </p>
    </div>
  );
}
