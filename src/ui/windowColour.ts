import { isTauri } from '../storage/platform';

/** An rgb() or rgba() colour as Tauri's [r, g, b, a], or null if it isn't one. */
export function rgbaOf(css: string): [number, number, number, number] | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(css.trim());
  if (!m) return null;
  const [, r = '0', g = '0', b = '0', a] = m;
  const alpha = a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);
  return [Math.round(+r), Math.round(+g), Math.round(+b), Math.round(alpha * 255)];
}

/**
 * The desktop window's own background matches the app's bars. While the window is dragged taller
 * on a Mac, the page is drawn a frame behind the window, so for a moment a strip of the window's
 * background shows under the footer; in the bars' colour it reads as part of the footer.
 */
export function matchWindowToBars(): void {
  if (!isTauri()) return;
  let last = '';
  const apply = () => {
    const probe = document.querySelector('.footer') ?? document.body;
    const colour = rgbaOf(getComputedStyle(probe).backgroundColor);
    if (!colour || colour[3] === 0) return;
    const key = colour.join(',');
    if (key === last) return;
    last = key;
    void Promise.all([import('@tauri-apps/api/window'), import('@tauri-apps/api/webview')]).then(([w, v]) =>
      Promise.all([w.getCurrentWindow().setBackgroundColor(colour), v.getCurrentWebview().setBackgroundColor(colour)]).catch(() => {}),
    );
  };
  // The theme lives in attributes on <html>; the footer appears once the app has drawn.
  new MutationObserver(() => requestAnimationFrame(apply)).observe(document.documentElement, { attributes: true });
  matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => requestAnimationFrame(apply));
  window.setTimeout(apply, 500);
}
