import { useEffect, useRef, useState } from 'react';

/** Hue 0–360, saturation and value 0–1. */
interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** "#3b2a20", "3B2A20" or "#abc" as six lowercase digits with a #, or null. */
export function normalHex(text: string): string | null {
  const m = HEX.exec(text.trim());
  if (!m) return null;
  const digits = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return `#${digits.toLowerCase()}`;
}

function toHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

function toHex({ h, s, v }: Hsv): string {
  const f = (k: number) => {
    const at = (k + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(at, 4 - at, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const SIZE = 168;

/**
 * Ready-made colours under the wheel, like Word's standard colours: a row of darks and a row of
 * brights. They are fitted to the page colour before they are shown (see swatchesFor).
 */
export const SWATCHES: { hex: string; name: string }[] = [
  { hex: '#000000', name: 'Black' },
  { hex: '#595959', name: 'Dark grey' },
  { hex: '#7f1d1d', name: 'Dark red' },
  { hex: '#8a4b14', name: 'Brown' },
  { hex: '#3f5f2a', name: 'Dark green' },
  { hex: '#1e4f6e', name: 'Dark teal' },
  { hex: '#1f3a8a', name: 'Navy' },
  { hex: '#4c2a7a', name: 'Dark purple' },
  { hex: '#a6a6a6', name: 'Grey' },
  { hex: '#d93025', name: 'Red' },
  { hex: '#e8692f', name: 'Orange' },
  { hex: '#d4a017', name: 'Gold' },
  { hex: '#4f8a3c', name: 'Green' },
  { hex: '#178a8a', name: 'Teal' },
  { hex: '#2f6fb5', name: 'Blue' },
  { hex: '#7d4fb0', name: 'Purple' },
];

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Readable text needs 4.5:1 against the page. */
const READABLE = 4.5;

/**
 * The swatches fitted to a page colour: each keeps its hue and is darkened (on a light page)
 * or lightened (on a dark one) only as far as it takes to read well on that page.
 */
export function swatchesFor(paper: string): { hex: string; name: string }[] {
  const dark = luminance(paper) < 0.18;
  return SWATCHES.map(({ hex, name }) => {
    let hsv = toHsv(hex);
    // On a dark page the greys turn over, so Black becomes white rather than a muddy grey.
    if (dark && hsv.s < 0.05) hsv = { ...hsv, v: 1 - hsv.v };
    let out = toHex(hsv);
    for (let i = 0; i < 40 && contrast(out, paper) < READABLE; i++) {
      hsv = dark ? { h: hsv.h, s: Math.max(0, hsv.s - 0.03), v: Math.min(1, hsv.v + 0.04) } : { ...hsv, v: Math.max(0, hsv.v - 0.03) };
      out = toHex(hsv);
    }
    return { hex: out, name };
  });
}

/** "rgb(253, 253, 252)" or "#fdfdfc" as a hex colour, or null. */
function cssToHex(css: string): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(css);
  if (m) {
    if (m[4] !== undefined && Number(m[4]) === 0) return null;
    return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
  }
  return normalHex(css);
}

/** The colour of the page being written on: the open page if there is one, else the theme's paper. */
function pageColour(): string {
  const page = document.querySelector('.cb-page');
  const own = page && cssToHex(getComputedStyle(page).backgroundColor);
  return own ?? cssToHex(getComputedStyle(document.documentElement).getPropertyValue('--paper')) ?? '#ffffff';
}

/**
 * A colour wheel with a brightness slider beside it and a hex field, then Automatic and the
 * ready-made swatches along the bottom, like Word's font colour menu. Hue goes round the
 * wheel and strength out from the centre; Automatic (the style's own colour) is ticked
 * until a colour is set by hand.
 */
export function ColourWheel({
  value,
  automatic,
  autoColour,
  onPick,
  onAutomatic,
}: {
  value: string;
  /** True when the words have no colour of their own and follow their style. */
  automatic: boolean;
  /** The style's colour, shown on the Automatic button. */
  autoColour: string;
  /** `done` is true for a one-click pick (a swatch), after which the menu can close. */
  onPick: (hex: string, done?: boolean) => void;
  onAutomatic: () => void;
}) {
  const [hsv, setHsv] = useState(() => toHsv(normalHex(value) ?? '#000000'));
  const [text, setText] = useState(value.toUpperCase());
  const canvas = useRef<HTMLCanvasElement>(null);
  // Read once as the menu opens, so the swatches suit this theme's page, or a page given its own colour.
  const [swatches] = useState(() => swatchesFor(pageColour()));

  useEffect(() => {
    const hex = normalHex(value);
    if (!hex || hex === toHex(hsv)) return;
    setHsv(toHsv(hex));
    setText(hex.toUpperCase());
  }, [value]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(SIZE, SIZE);
    const r = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - r + 0.5;
        const dy = y - r + 0.5;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const hex = toHex({ h: (Math.atan2(dy, dx) * 180) / Math.PI + 180, s: dist / r, v: hsv.v });
        const n = parseInt(hex.slice(1), 16);
        const i = (y * SIZE + x) * 4;
        img.data[i] = (n >> 16) & 255;
        img.data[i + 1] = (n >> 8) & 255;
        img.data[i + 2] = n & 255;
        // A soft edge, so the disc isn't jagged.
        img.data[i + 3] = Math.round(255 * Math.min(1, r - dist + 0.5));
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv.v]);

  const pick = (next: Hsv) => {
    setHsv(next);
    const hex = toHex(next);
    setText(hex.toUpperCase());
    onPick(hex);
  };
  const fromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - box.left - box.width / 2;
    const dy = e.clientY - box.top - box.height / 2;
    const s = Math.min(1, Math.hypot(dx, dy) / (box.width / 2));
    pick({ h: (Math.atan2(dy, dx) * 180) / Math.PI + 180, s, v: hsv.v || 1 });
  };
  // The slider is drawn by hand, so it stands upright the same way in every web view.
  const fromSlider = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    pick({ ...hsv, v: Math.round(v * 100) / 100 });
  };
  const sliderKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const keys: Record<string, number> = { ArrowUp: hsv.v + step, ArrowRight: hsv.v + step, ArrowDown: hsv.v - step, ArrowLeft: hsv.v - step, PageUp: hsv.v + 0.1, PageDown: hsv.v - 0.1, Home: 1, End: 0 };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    pick({ ...hsv, v: Math.round(Math.min(1, Math.max(0, next)) * 100) / 100 });
  };
  const angle = ((hsv.h - 180) * Math.PI) / 180;
  const dot = { left: `${50 + 50 * hsv.s * Math.cos(angle)}%`, top: `${50 + 50 * hsv.s * Math.sin(angle)}%` };
  const current = automatic ? null : normalHex(value);

  return (
    <div className="wheel">
      <div className="wheel-top">
        <div className="wheel-disc">
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            aria-label="Colour wheel"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              fromPointer(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
          />
          <span className="wheel-dot" style={{ ...dot, background: toHex(hsv) }} aria-hidden="true" />
        </div>
        <div
          className="wheel-light"
          role="slider"
          tabIndex={0}
          aria-label="Brightness"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          style={{ background: `linear-gradient(to top, #000, ${toHex({ ...hsv, v: 1 })})` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            fromSlider(e);
          }}
          onPointerMove={(e) => e.buttons === 1 && fromSlider(e)}
          onKeyDown={sliderKey}
        >
          <span className="wheel-thumb" style={{ top: `${(1 - hsv.v) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
      <div className="wheel-row">
        <span className="wheel-swatch" style={{ background: toHex(hsv) }} aria-hidden="true" />
        <label className="wheel-hex">
          <span>Hex</span>
          <input
            aria-label="Hex colour"
            maxLength={7}
            value={text}
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              const hex = normalHex(e.target.value);
              if (hex) {
                setHsv(toHsv(hex));
                onPick(hex);
              }
            }}
            onBlur={() => setText(toHex(hsv).toUpperCase())}
          />
        </label>
      </div>
      <div className="wheel-swatches" role="radiogroup" aria-label="Colours">
        <button className="wheel-auto" role="radio" aria-checked={automatic} onClick={onAutomatic} title="The style's own colour">
          <span className="wheel-chip" style={{ background: autoColour }} aria-hidden="true" />
          Automatic
        </button>
        <div className="wheel-grid">
          {swatches.map((s) => (
            <button
              key={s.hex}
              className="wheel-chip"
              role="radio"
              aria-checked={current === s.hex}
              aria-label={s.name}
              title={s.name}
              style={{ background: s.hex }}
              onClick={() => {
                setHsv(toHsv(s.hex));
                setText(s.hex.toUpperCase());
                onPick(s.hex, true);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
