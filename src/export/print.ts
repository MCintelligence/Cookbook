/**
 * Prints a page of HTML through the system print dialog, where "Save as PDF"
 * makes the PDF. The page goes into a hidden frame so the app itself isn't printed.
 */
export function printHtml(html: string): Promise<void> {
  // The frame doesn't share the app's fonts, so they're copied in, with the app's address as the base for their files.
  const faces: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) if (rule instanceof CSSFontFaceRule) faces.push(rule.cssText);
    } catch {
      // A sheet from another origin can't be read; its fonts fall back.
    }
  }
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
