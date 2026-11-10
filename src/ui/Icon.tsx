import { ICONS, type IconName } from './iconArt';

/** One of the app's icons (see iconArt.ts) at the given size, in the current colour. */
export function Icon({ name, size = 16, className, label }: { name: IconName; size?: number; className?: string; label?: string }) {
  const art = ICONS[name];
  const scale = art.grid / 24;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${art.grid} ${art.grid}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {art.parts.map((p, i) =>
        'f' in p ? <path key={i} d={p.f} fill="currentColor" fillRule="evenodd" /> : <path key={i} d={p.s} stroke="currentColor" strokeWidth={p.w * scale} />,
      )}
    </svg>
  );
}
