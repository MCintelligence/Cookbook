import { ANDROID_APP, canPrintNatively, printNatively } from '../mobile';

/** A font file as a data: address, so a page with no way to reach Cookbook's own files can still use it. */
async function asDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The Android app prints through the system's own print screen, which is also where "Save as PDF"
 * is. Android lays the page out in a view of its own that can't load Cookbook's fonts, so the
 * faces the page names travel inside it.
 */
async function printOnAndroid(html: string, faces: CSSFontFaceRule[]): Promise<void> {
  if (!canPrintNatively()) throw new Error('Printing is not available in this copy of the app.');
  const used = faces.filter((face) => html.includes(face.style.getPropertyValue('font-family').replace(/["']/g, '').trim()));
  const css = await Promise.all(
    used.map(async (face) => {
      let text = face.cssText;
      for (const [whole, , url] of text.matchAll(/url\((["']?)([^"')]+)\1\)/g)) {
        if (!url || url.startsWith('data:')) continue;
        try {
          text = text.replace(whole, `url("${await asDataUrl(new URL(url, document.baseURI).href)}")`);
        } catch {
          // A face that can't be read falls back to the device's own serif.
        }
      }
      return text;
    }),
  );
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || 'Cookbook';
  printNatively(html.replace('<head>', `<head><style>${css.join('\n')}</style>`), title);
}

/**
 * Prints a page of HTML through the system print dialog, where "Save as PDF"
 * makes the PDF. The page goes into a hidden frame so the app itself isn't printed.
 */
export function printHtml(html: string): Promise<void> {
  // The frame doesn't share the app's fonts, so they're copied in, with the app's address as the base for their files.
  const faces: string[] = [];
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) if (rule instanceof CSSFontFaceRule) (faces.push(rule.cssText), rules.push(rule));
    } catch {
      // A sheet from another origin can't be read; its fonts fall back.
    }
  }
  if (ANDROID_APP) return printOnAndroid(html, rules);
  const page = html.replace('<head>', `<head><base href="${document.baseURI}"><style>${faces.join('\n')}</style>`);
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;';
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return reject(new Error('Printing is not available here.'));
      // Fonts load before the page is laid out for print.
      void (win.document.fonts?.ready ?? Promise.resolve()).then(() => {
        win.focus();
        win.print();
        // print() blocks until the dialog closes in most browsers; the frame goes after that.
        setTimeout(() => frame.remove(), 1000);
        resolve();
      });
    };
    frame.srcdoc = page;
    document.body.appendChild(frame);
  });
}
