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
 * A colour wheel, a brightness slider and a hex field, like Word's custom
 * colours. Hue goes round the wheel and strength out from the centre.
 */
export function ColourWheel({ value, onPick, onAutomatic }: { value: string; onPick: (hex: string) => void; onAutomatic: () => void }) {
  const [hsv, setHsv] = useState(() => toHsv(normalHex(value) ?? '#000000'));
  const [text, setText] = useState(value.toUpperCase());
  const canvas = useRef<HTMLCanvasElement>(null);

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
  const angle = ((hsv.h - 180) * Math.PI) / 180;
  const dot = { left: `${50 + 50 * hsv.s * Math.cos(angle)}%`, top: `${50 + 50 * hsv.s * Math.sin(angle)}%` };

  return (
    <div className="wheel">
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
      <input
        className="wheel-light"
        type="range"
        min={0}
        max={100}
        aria-label="Brightness"
        value={Math.round(hsv.v * 100)}
        style={{ background: `linear-gradient(to right, #000, ${toHex({ ...hsv, v: 1 })})` }}
        onChange={(e) => pick({ ...hsv, v: Number(e.target.value) / 100 })}
      />
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
        <button className="wheel-auto" onClick={onAutomatic}>
          Automatic
        </button>
      </div>
    </div>
  );
}
