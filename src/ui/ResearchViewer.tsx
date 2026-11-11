import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { type IconName } from './iconArt';
import { type ResearchKind, type WebResource, decodeText, extensionOf, kindName, mimeOf, readWebArchive, researchKind } from '../storage/research';

interface Props {
  /** The file to show, as a path in the recipe. */
  file: string;
  loadBytes: (path: string) => Promise<Uint8Array>;
  onSave: () => void;
  style?: CSSProperties;
}

const ICON: Record<ResearchKind, IconName> = { picture: 'picture', pdf: 'page', web: 'web', sound: 'sound', film: 'film', other: 'page' };

const sizeOf = (n: number) => (n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * A Research Item's file, shown above its page of notes as Scrivener shows research in the editor:
 * pictures, PDFs (page by page, with their words selectable), web pages as they were saved, sound
 * and films. Anything else can be saved out to open in another app. Nothing here goes online.
 */
export function ResearchViewer({ file, loadBytes, onSave, style }: Props) {
  const kind = researchKind(file);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBytes(null);
    setFailed(null);
    setZoom(1);
    setPages(null);
    setFrom(null);
    loadBytes(file).then(
      (b) => live && setBytes(b),
      () => live && setFailed('The file isn’t in the recipe any more. It may have been moved or deleted outside Cookbook.'),
    );
    return () => {
      live = false;
    };
  }, [file, loadBytes]);

  const name = file.slice(file.lastIndexOf('/') + 1);
  const zoomable = kind === 'pdf' || kind === 'picture';
  return (
    <section className={`research-viewer is-${kind}`} style={style} aria-label={`${kindName(file)}: ${name}`}>
      <header className="research-bar">
        <Icon name={ICON[kind]} size={15} />
        <span className="research-kind">{kindName(file)}</span>
        <span className="research-name" title={file}>
          {name}
          {bytes && ` · ${sizeOf(bytes.length)}`}
          {pages !== null && ` · ${pages === 1 ? '1 page' : `${pages} pages`}`}
        </span>
        {zoomable && bytes && !failed && (
          <span className="research-zoom" role="group" aria-label="Zoom">
            <button className="icon-btn" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>
              <Icon name="remove" size={13} />
            </button>
            <button className="research-zoom-label" title="Fit the width" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button className="icon-btn" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>
              <Icon name="add" size={13} />
            </button>
          </span>
        )}
        <button className="research-save" onClick={onSave} disabled={!bytes}>
          Save a copy…
        </button>
      </header>
      {from && (
        <p className="research-from">
          Saved from <span title={from}>{from}</span>
        </p>
      )}
      <div className="research-body">
        {failed ? (
          <p className="research-note">{failed}</p>
        ) : !bytes ? (
          <p className="research-note">Opening…</p>
        ) : kind === 'pdf' ? (
          <PdfView bytes={bytes} zoom={zoom} onPages={setPages} onFail={setFailed} />
        ) : kind === 'web' ? (
          <WebView bytes={bytes} ext={extensionOf(file)} onFrom={setFrom} />
        ) : kind === 'other' ? (
          <p className="research-note">Cookbook can’t show this kind of file, but it is kept safe with the recipe. Save a copy to open it in another app.</p>
        ) : (
          <MediaView bytes={bytes} file={file} kind={kind} zoom={zoom} />
        )}
      </div>
    </section>
  );
}

/** A blob URL for the bytes, let go of when they change or the view goes. */
function useBlobUrl(bytes: Uint8Array, type: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const made = URL.createObjectURL(new Blob([bytes.slice()], { type }));
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes, type]);
  return url;
}

function MediaView({ bytes, file, kind, zoom }: { bytes: Uint8Array; file: string; kind: 'picture' | 'sound' | 'film'; zoom: number }) {
  const url = useBlobUrl(bytes, mimeOf(file));
  const [broken, setBroken] = useState(false);
  if (!url) return null;
  if (broken) return <p className="research-note">This {kind === 'picture' ? 'picture' : kind === 'film' ? 'film' : 'sound'} can’t be played or shown here. Save a copy to open it in another app.</p>;
  if (kind === 'sound') return <audio className="research-audio" controls src={url} onError={() => setBroken(true)} />;
  if (kind === 'film') return <video className="research-video" controls src={url} onError={() => setBroken(true)} />;
  return (
    <div className="research-picture">
      <img src={url} alt="" style={{ width: `${zoom * 100}%` }} onError={() => setBroken(true)} draggable={false} />
    </div>
  );
}

// ---------- PDFs ----------

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: Promise<PdfJs> | null = null;
/** pdf.js and its worker, loaded the first time a PDF is opened, so nothing else pays for them. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?worker')]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerPort ??= new worker.default();
    return m;
  });
  return pdfjs;
}

type PdfDoc = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

function PdfView({ bytes, zoom, onPages, onFail }: { bytes: Uint8Array; zoom: number; onPages: (n: number) => void; onFail: (why: string) => void }) {
  const [pdf, setPdf] = useState<{ doc: PdfDoc; lib: PdfJs; ratio: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let live = true;
    let loaded: PdfDoc | null = null;
    loadPdfJs()
      .then(async (lib) => {
        // pdf.js takes the bytes over, so it is given a copy.
        loaded = await lib.getDocument({ data: bytes.slice() }).promise;
        const first = await loaded.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (!live) return;
        setPdf({ doc: loaded, lib, ratio: v.height / v.width });
        onPages(loaded.numPages);
      })
      .catch(() => live && onFail('This PDF couldn’t be read. It may be damaged or locked with a password. Save a copy to open it in another app.'));
    return () => {
      live = false;
      void loaded?.destroy();
    };
  }, [bytes]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setWidth(el.clientWidth));
    watch.observe(el);
    setWidth(el.clientWidth);
    return () => watch.disconnect();
  }, []);

  const pageWidth = Math.max(200, (width - 32) * zoom);
  return (
    <div className="research-pdf" ref={box}>
      {pdf && width > 0 && Array.from({ length: pdf.doc.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} n={i + 1} width={pageWidth} />)}
    </div>
  );
}

/** One page of a PDF: drawn only once it comes near the screen, with its words over it to select and copy. */
function PdfPage({ pdf, n, width }: { pdf: { doc: PdfDoc; lib: PdfJs; ratio: number }; n: number; width: number }) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [height, setHeight] = useState(width * pdf.ratio);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '600px 0px' });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    const el = holder.current;
    if (!near || !el) return;
    let live = true;
    let task: { cancel: () => void } | null = null;
    void (async () => {
      const page = await pdf.doc.getPage(n);
      if (!live) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      setHeight(viewport.height);
      const canvas = document.createElement('canvas');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const render = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      task = render;
      await render.promise;
      if (!live) return;
      const text = document.createElement('div');
      text.className = 'textLayer';
      el.replaceChildren(canvas, text);
      el.style.setProperty('--scale-factor', String(scale));
      el.style.setProperty('--total-scale-factor', String(scale));
      await new pdf.lib.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport }).render();
    })().catch(() => {
      // A page that can't be drawn stays blank; the rest still show.
    });
    return () => {
      live = false;
      task?.cancel();
    };
  }, [near, width, pdf, n]);

  return <div className="research-pdf-page" ref={holder} style={{ width, height }} aria-label={`Page ${n}`} />;
}

// ---------- web pages ----------

/** Shuts the saved page off from the internet and from the app: no scripts, nothing fetched, links go nowhere. */
const SHUT = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline' data:; font-src data:; media-src data:"><base target="_blank">`;

function base64(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length; i += 0x8000) out += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(out);
}

/**
 * The page as it was saved, ready for a sandboxed frame: the pictures, stylesheets and fonts saved
 * with it are put inside it, and its scripts are taken out.
 */
export function savedPage(html: string, base: string | null, resources: WebResource[]): string {
  const byUrl = new Map(resources.map((r) => [r.url, r]));
  const resolve = (u: string, from: string | null) => {
    try {
      return new URL(u, from ?? undefined).href;
    } catch {
      return u;
    }
  };
  const css = (text: string, from: string | null): string =>
    text.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _q: string, u: string) => {
      const r = byUrl.get(resolve(u.trim(), from));
      return r ? `url("data:${r.mime};base64,${base64(r.data)}")` : whole;
    });
  const dataOf = (u: string | null): string | null => {
    if (!u) return null;
    const r = byUrl.get(resolve(u, base));
    if (!r) return null;
    return r.mime.startsWith('text/css') ? `data:text/css;base64,${base64(new TextEncoder().encode(css(decodeText(r.data, r.encoding), r.url)))}` : `data:${r.mime};base64,${base64(r.data)}`;
  };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, noscript, iframe, frame, object, embed, base, meta[http-equiv], link[rel~="preload"], link[rel~="prefetch"]').forEach((el) => el.remove());
  for (const el of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
    const r = byUrl.get(resolve(el.getAttribute('href')!, base));
    if (!r) {
      el.remove();
      continue;
    }
    const style = doc.createElement('style');
    style.textContent = css(decodeText(r.data, r.encoding), r.url);
    el.replaceWith(style);
  }
  for (const attr of ['src', 'poster', 'data-src']) {
    for (const el of Array.from(doc.querySelectorAll(`[${attr}]`))) {
      const d = dataOf(el.getAttribute(attr));
      if (d) el.setAttribute(attr === 'data-src' ? 'src' : attr, d);
    }
  }
  for (const el of Array.from(doc.querySelectorAll('[srcset]'))) {
    const picked = el
      .getAttribute('srcset')!
      .split(',')
      .map((c) => c.trim().split(/\s+/)[0] ?? '')
      .map(dataOf)
      .find(Boolean);
    el.removeAttribute('srcset');
    if (picked && !el.getAttribute('src')?.startsWith('data:')) el.setAttribute('src', picked);
  }
  doc.querySelectorAll('style').forEach((el) => (el.textContent = css(el.textContent ?? '', base)));
  doc.querySelectorAll('[style]').forEach((el) => el.setAttribute('style', css(el.getAttribute('style') ?? '', base)));
  // Links can't be followed from inside: they show where they went, for the writer to copy.
  doc.querySelectorAll('a[href]').forEach((el) => el.setAttribute('title', resolve(el.getAttribute('href')!, base)));
  doc.head.insertAdjacentHTML('afterbegin', SHUT);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

function WebView({ bytes, ext, onFrom }: { bytes: Uint8Array; ext: string; onFrom: (url: string | null) => void }) {
  const [page, setPage] = useState<string | null>(null);
  useEffect(() => {
    if (ext === 'webarchive') {
      const archive = readWebArchive(bytes);
      if (!archive) {
        setPage(`<!doctype html><html><head>${SHUT}</head><body style="font: 15px system-ui; color: #555; padding: 24px">This web archive couldn’t be read. Save a copy to open it in Safari.</body></html>`);
        return;
      }
      onFrom(archive.main.url || null);
      setPage(savedPage(decodeText(archive.main.data, archive.main.encoding), archive.main.url || null, archive.resources));
      return;
    }
    const html = decodeText(bytes, null);
    // A page saved from a browser often notes where it came from.
    const saved = /<!--\s*saved from url=\(\d+\)(\S+)\s*-->/i.exec(html)?.[1] ?? null;
    onFrom(saved);
    setPage(savedPage(html, saved, []));
  }, [bytes, ext]);
  if (page === null) return null;
  return <iframe className="research-web" title="Saved web page" sandbox="" srcDoc={page} />;
}
