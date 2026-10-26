import { type SeasoningId } from '../proofread/remarks';

/**
 * Each seasoning as a line drawing in the current colour, with an outline
 * of its own so they tell apart without colour or a name: Sam a salt shaker
 * with a domed cap, Pete a chilli pepper, Daniel a
 * bottle leaning over, hiccuping, and Sally a cupcake with a cherry.
 */
export function Face({ id, size = 28 }: { id: SeasoningId; size?: number }) {
  // Small faces get a heavier line so it stays a line.
  const stroke = size >= 48 ? 2 : size >= 30 ? 2.6 : 3.2;
  return (
    <svg
      className="face"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {id === 'sam' && (
        <>
          <path d="M15 16a9 9 0 0 1 18 0z" />
          <path d="M14 16h20v3.5H14z" />
          <path d="M15 19.5 13.5 41a2 2 0 0 0 2 2.2h17a2 2 0 0 0 2-2.2L33 19.5" />
          <g fill="currentColor" stroke="none">
            <circle cx="20.5" cy="12" r="1.2" />
            <circle cx="24" cy="10" r="1.2" />
            <circle cx="27.5" cy="12" r="1.2" />
          </g>
          <path d="M18.5 26.5l4 1.6M29.5 26.5l-4 1.6" />
          <path d="M20.5 31v.1M27.5 31v.1" />
          <path d="M21 37.5q3-2.2 6 0" />
        </>
      )}
      {id === 'pete' && (
        <>
          <path d="M13.5 13.5c-.5-4.5 1.5-7.5 5.5-9" />
          <path d="M7.5 18.5c1.5-4 5.5-6 10-5 2.5-1.5 5.5-1 7 1" />
          <path d="M7.5 18.5c-.5 6 4 10.5 11 15.5 6 4.5 13 7.5 22 9.5-3.5-6.5-6.5-14-9-20.5-2-5-4-8-7-9" />
          <path d="M13 20.5l3.5 1.5M23.5 19.5l-3.5 2" />
          <path d="M15 25v.1M21.5 24.5v.1" />
          <path d="M16 29.5q3-1.5 6 .5" />
        </>
      )}
      {id === 'daniel' && (
        <>
          <g transform="rotate(14 24 30)">
            <path d="M21 3.5h6v5h-6z" />
            <path d="M21.5 8.5v6c0 4-5.5 5-5.5 10.5v16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-16c0-5.5-5.5-6.5-5.5-10.5v-6" />
            <path d="M16 28h16M16 39h16" />
            <path d="M19.5 32.5q1.5-1.2 3 0M25.5 32.5h3" />
            <path d="M21 36q3 1.8 6-.6" />
          </g>
          <circle cx="38.5" cy="12" r="2" />
          <circle cx="42.5" cy="6" r="1.3" />
        </>
      )}
      {id === 'sally' && (
        <>
          <path d="M26 9.5c.2-3 1.5-5 4-6.5" />
          <circle cx="25" cy="11.5" r="2.5" />
          <path d="M11.5 27c-2.5-4 0-8 4-7.5-.5-4.5 4-7 8-5.5 3-2.5 9-1 9.5 4 4-.5 6.5 4 4 9z" />
          <path d="M12.5 27 16 43.5h16L35.5 27" />
          <path d="M19 27l1.5 16.5M24 27v16.5M29 27l-1.5 16.5" />
          <path d="M18.5 21.5q1.8-1.8 3.6 0M25.9 21.5q1.8-1.8 3.6 0" />
          <path d="M21.5 24.5q2.5 1.6 5 0" />
        </>
      )}
    </svg>
  );
}
