import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

/**
 * How a page is shown at its zoom.
 *
 * The page is scaled with a transform, not CSS `zoom`. Under `zoom`, the Mac's engine
 * reports where text sits (its boxes) as if there were no zoom but finds what is under the
 * pointer with the zoom, so at 110% every lookup from a point to a place in the text was
 * off by a tenth: a right-click on selected text landed past the end of the line and
 * cleared the selection. Under a transform the boxes and the pointer agree in every engine.
 *
 * A transform doesn't change how much room the page takes, so the frame around it takes
 * the scaled size: as wide as the page shows, and as tall as the page grows.
 */
export function scaledPage(scale: number, page: CSSProperties): CSSProperties {
  return {
    ...page,
    // The page fills the frame at its own scale; the frame sets the width it shows at.
    width: `calc(100% / ${scale})`,
    maxWidth: 'none',
    transform: scale === 1 ? undefined : `scale(${scale})`,
    transformOrigin: '0 0',
  };
}

interface Props {
  scale: number;
  /** Width and limits of the frame, as the page shows on screen. */
  style: CSSProperties;
  hidden?: boolean;
  className?: string;
  children: ReactNode;
}

/** The room a scaled page takes: its width comes from `style`, its height from the page inside. */
export function PageFrame({ scale, style, hidden, className, children }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const watching = useRef<{ page: Element; scale: number; stop: () => void } | null>(null);
  // Runs after each render but only starts watching again when the page inside or the scale changes.
  useLayoutEffect(() => {
    const page = frame.current?.firstElementChild as HTMLElement | null | undefined;
    const was = watching.current;
    if (was && was.page === page && was.scale === scale) return;
    was?.stop();
    watching.current = null;
    if (!page) return;
    // offsetHeight is the page's own height, before the transform scales it.
    const measure = () => setHeight(page.offsetHeight * scale);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(page);
    watching.current = { page, scale, stop: () => watch.disconnect() };
  });
  useLayoutEffect(() => () => watching.current?.stop(), []);
  return (
    <div ref={frame} className={`page-frame${className ? ` ${className}` : ''}`} style={{ ...style, height: height ?? undefined }} hidden={hidden}>
      {children}
    </div>
  );
}
