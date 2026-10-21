/** The Cookbook mark: a torn page that warms into a flame. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="22 10 84 106" aria-hidden="true">
      <defs>
        <linearGradient id="cookbook-mark" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FFFBF3" />
          <stop offset="0.45" stopColor="#FFFBF3" />
          <stop offset="0.62" stopColor="#E9B949" />
          <stop offset="0.88" stopColor="#A84A28" />
        </linearGradient>
      </defs>
      <path
        d="M32 108 L38 113 L45 108 L52 114 L59 108 L66 113 L73 108 L80 114 L87 108 L96 112 V64 C96 54 93 48 91 40 C87 46 85 48 81 50 C83 38 78 26 70 14 C68 24 64 32 60 36 C58 30 54 26 50 22 C48 32 45 40 41 44 C39 42 37 40 35 36 C32 46 32 54 32 62 Z"
        fill="url(#cookbook-mark)"
        stroke="#3B2A20"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
