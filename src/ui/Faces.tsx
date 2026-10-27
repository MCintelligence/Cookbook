import { type SeasoningId } from '../proofread/remarks';

/** Each seasoning's face: a shaker with a look of its own. */
export function Face({ id, size = 28 }: { id: SeasoningId; size?: number }) {
  return (
    <svg className="face" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {id === 'sam' && (
        <>
          <rect x="11" y="4" width="18" height="9" rx="4" fill="#cfd6dc" />
          <path d="M10 13h20l1.5 21a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#ffffff" stroke="#c8c8c3" strokeWidth="1.2" />
          <circle cx="16" cy="23" r="1.7" fill="#1c1c1b" />
          <circle cx="24" cy="23" r="1.7" fill="#1c1c1b" />
          <path d="M13 19.5l4.5 1.5M27 19.5l-4.5 1.5" stroke="#1c1c1b" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 30q4-2.6 8 0" fill="none" stroke="#1c1c1b" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="16" cy="8.5" r="1" fill="#6b6b67" />
          <circle cx="20" cy="7.5" r="1" fill="#6b6b67" />
          <circle cx="24" cy="8.5" r="1" fill="#6b6b67" />
        </>
      )}
      {id === 'pete' && (
        <>
          <rect x="11" y="4" width="18" height="9" rx="4" fill="#1c1c1b" />
          <path d="M10 13h20l1.5 21a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#7a4a2c" stroke="#5a3a26" strokeWidth="1.2" />
          <circle cx="16" cy="23" r="1.7" fill="#fdfdfc" />
          <circle cx="24" cy="23" r="1.7" fill="#fdfdfc" />
          <path d="M13 18.5l4.5 2.5M27 18.5l-4.5 2.5" stroke="#fdfdfc" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M15 28q5 4.5 10 0z" fill="#fdfdfc" />
        </>
      )}
      {id === 'daniel' && (
        <>
          <rect x="11" y="4" width="18" height="9" rx="4" fill="#6b2a3c" />
          <path d="M10 13h20l1.5 21a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#e9c3a8" stroke="#c8c8c3" strokeWidth="1.2" />
          <path d="M14 23q2-1.8 4 0M22 22.4q2 1.8 4 0" fill="none" stroke="#1c1c1b" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M16 29.5q5 1.5 8-1.5" fill="none" stroke="#1c1c1b" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="13.5" cy="27" r="1.8" fill="#e07a7a" />
          <circle cx="26.5" cy="27" r="1.8" fill="#e07a7a" />
          <circle cx="33" cy="9" r="1.6" fill="none" stroke="#8e8e89" strokeWidth="1" />
          <circle cx="36" cy="5" r="1.1" fill="none" stroke="#8e8e89" strokeWidth="1" />
        </>
      )}
      {id === 'sally' && (
        <>
          <rect x="11" y="4" width="18" height="9" rx="4" fill="#2f6b2a" />
          <path d="M10 13h20l1.5 21a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3z" fill="#d6452b" stroke="#a8321e" strokeWidth="1.2" />
          <circle cx="16" cy="8.5" r="1" fill="#9fd08a" />
          <circle cx="20" cy="7.5" r="1" fill="#9fd08a" />
          <circle cx="24" cy="8.5" r="1" fill="#9fd08a" />
          <path d="M13.5 19.5l4 1.6M26.5 19.5l-4 1.6" stroke="#fff4ee" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="16" cy="23.5" r="1.7" fill="#fff4ee" />
          <circle cx="24" cy="23.5" r="1.7" fill="#fff4ee" />
          <path d="M15 28.5q5 4 10 0" fill="none" stroke="#fff4ee" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M31 4q2 3 0 5q3-1 3-4q0-2-1.5-3q.5 1.5-1.5 2z" fill="#e8792f" />
        </>
      )}
    </svg>
  );
}
