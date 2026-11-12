import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Icon } from './Icon';
import { isTauri } from '../storage/platform';

interface Props {
  url: string;
  /** Picks a page saved from a browser, to keep with the note. */
  onAddSaved: () => void;
  /** Takes the web address off the note. */
  onForget: () => void;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the app shows over a page: a live web view must step aside for these. */
const OVER = '.menu, [role="menu"], [role="dialog"], [role="listbox"], [role="alertdialog"], .tb-popover, .plate-menu, .modal, .backdrop';

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, width: r.width, height: r.height });
const sameBox = (a: Box | null, b: Box) => !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const meets = (a: DOMRect, b: Box) => a.right > b.x && a.left < b.x + b.width && a.bottom > b.y && a.top < b.y + b.height;

/** Where the page in the view has been, so Back and Forward know when there is somewhere to go. */
function useTrail(start: string) {
  const [trail, setTrail] = useState({ pages: [start], at: 0 });
  const step = useRef<'back' | 'forward' | null>(null);
  useEffect(() => setTrail({ pages: [start], at: 0 }), [start]);
  const arrived = (href: string) =>
    setTrail((t) => {
      const going = step.current;
      step.current = null;
      if (t.pages[t.at] === href) return t;
      if (going === 'back' && t.at > 0) {
        const pages = t.pages.slice();
        pages[t.at - 1] = href;
        return { pages, at: t.at - 1 };
      }
      if (going === 'forward' && t.at < t.pages.length - 1) {
        const pages = t.pages.slice();
        pages[t.at + 1] = href;
        return { pages, at: t.at + 1 };
      }
      return { pages: [...t.pages.slice(0, t.at + 1), href], at: t.at + 1 };
    });
  return { canBack: trail.at > 0, canForward: trail.at < trail.pages.length - 1, step, arrived };
}

/**
 * A Research note's web page, shown live from its address the way Scrivener shows one: nothing
 * has to be saved first. In the desktop app it is a real browser view laid over this card, so it
 * also shows sites that won't sit inside another page; in a web browser it is a frame. With no
 * connection it says so, and the page shows again once the connection is back.
 */
export function ResearchWeb({ url, onAddSaved, onForget }: Props) {
  const spot = useRef<HTMLDivElement>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  /** 'view' when the desktop's own browser view shows it, 'frame' when a frame does. */
  const [how, setHow] = useState<'view' | 'frame'>(() => (isTauri() ? 'view' : 'frame'));
  const [here, setHere] = useState(url);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const trail = useTrail(url);

  useEffect(() => {
    setHere(url);
    setTitle(null);
    setLoading(true);
  }, [url]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // What the page in the view is doing, for the bar.
  useEffect(() => {
    if (how !== 'view') return;
    let stop: (() => void) | null = null;
    let gone = false;
    void listen<{ url?: string | null; title?: string | null; loading?: boolean | null }>('research-web', ({ payload }) => {
      if (payload.url) {
        setHere(payload.url);
        if (payload.loading === false) trail.arrived(payload.url);
      }
      if (payload.title != null) setTitle(payload.title || null);
      if (payload.loading != null) setLoading(payload.loading);
    }).then((unlisten) => (gone ? unlisten() : (stop = unlisten)));
    return () => {
      gone = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [how]);

  // The desktop's browser view: shown over this card, kept in step with it every frame (the desk
  // scrolls, panels slide, the window resizes), and out of the way of the app's menus and dialogs.
  useEffect(() => {
    if (how !== 'view' || !online) return;
    const el = spot.current;
    if (!el) return;
    let live = true;
    let ready = false;
    let frame = 0;
    let placed: Box | null = null;
    let seen: Box | null = null;
    let shown = true;
    const desk = el.closest('.desk') ?? document.documentElement;
    const clipOf = (): Box => {
      const r = desk.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const left = Math.max(0, r.left);
      return { x: left, y: top, width: Math.max(0, Math.min(window.innerWidth, r.left + desk.clientWidth) - left), height: Math.max(0, Math.min(window.innerHeight, r.top + desk.clientHeight) - top) };
    };
    const covered = (page: Box) => {
      for (const over of document.querySelectorAll(OVER)) {
        if (el.contains(over)) continue;
        const r = over.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && meets(r, page)) return true;
      }
      return false;
    };
    const tick = () => {
      if (!live) return;
      frame = requestAnimationFrame(tick);
      if (!ready) return;
      const page = boxOf(el.getBoundingClientRect());
      const clip = clipOf();
      const inView = page.y < clip.y + clip.height && page.y + page.height > clip.y && clip.width > 0;
      const show = inView && !covered(page) && document.visibilityState === 'visible';
      if (show && (!sameBox(placed, page) || !sameBox(seen, clip))) {
        placed = page;
        seen = clip;
        void invoke('web_place', { page, clip }).catch(() => {});
      }
      if (show !== shown) {
        shown = show;
        void invoke('web_shown', { shown: show }).catch(() => {});
      }
    };
    const page = boxOf(el.getBoundingClientRect());
    const clip = clipOf();
    placed = page;
    seen = clip;
    invoke('web_show', { url, page, clip })
      .then(() => {
        ready = true;
      })
      .catch(() => {
        // The phone apps have no view of their own for it: a frame shows it instead.
        if (live) setHow('frame');
      });
    frame = requestAnimationFrame(tick);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [how, online, url]);

  // Leaving the note closes the view, so nothing on the page keeps playing.
  useEffect(() => {
    if (how !== 'view') return;
    return () => void invoke('web_close').catch(() => {});
  }, [how]);
  useEffect(() => {
    if (how === 'view' && !online) void invoke('web_close').catch(() => {});
  }, [how, online]);

  const go = (to: 'back' | 'forward' | 'reload') => {
    if (how === 'frame') {
      setFrameKey((k) => k + 1);
      return;
    }
    if (to !== 'reload') trail.step.current = to;
    void invoke('web_go', { to }).catch(() => {});
  };
  const openOutside = () => {
    if (isTauri()) {
      void invoke('web_open_outside', { url: here }).catch(() => {
        window.open(here, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(here, '_blank', 'noopener,noreferrer');
    }
  };
  const copy = () => {
    void navigator.clipboard?.writeText(here).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <>
      <header className="research-bar research-web-bar">
        <Icon name="web" size={15} />
        {how === 'view' && (
          <>
            <button className="icon-btn" aria-label="Back" title="Back" disabled={!online || !trail.canBack} onClick={() => go('back')}>
              <Icon name="back" size={15} />
            </button>
            <button className="icon-btn" aria-label="Forward" title="Forward" disabled={!online || !trail.canForward} onClick={() => go('forward')}>
              <Icon name="forward" size={15} />
            </button>
          </>
        )}
        <button className="icon-btn" aria-label="Reload" title="Reload" disabled={!online} onClick={() => go('reload')}>
          <Icon name="reload" size={15} />
        </button>
        <span className={`research-web-where${loading && online ? ' is-loading' : ''}`} title={here}>
          {title && <b>{title}</b>}
          <span className="research-web-address">{here}</span>
        </span>
        <button className="research-save" onClick={copy}>
          {copied ? 'Copied' : 'Copy address'}
        </button>
        <button className="research-save research-outside" onClick={openOutside} title="Open this page in your own web browser">
          <Icon name="outside" size={14} />
          Open in browser
        </button>
        <button className="icon-btn" aria-label="Take the address off this note" title="Take the address off this note" onClick={onForget}>
          <Icon name="remove" size={13} />
        </button>
      </header>
      {online ? (
        how === 'view' ? (
          <div ref={spot} className="research-web research-live" aria-label={`Web page: ${here}`} />
        ) : (
          <>
            <iframe
              key={frameKey}
              className="research-web"
              src={url}
              title={`Web page: ${url}`}
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => setLoading(false)}
            />
            <p className="research-web-tip">
              Blank? Some sites won’t show inside another page. Open it in your browser instead, or{' '}
              <button className="text-link" onClick={onAddSaved}>
                add a saved copy
              </button>
              .
            </p>
          </>
        )
      ) : (
        <div className="research-web research-web-off" role="status">
          <Icon name="web" size={28} />
          <p>
            <b>No connection right now.</b> The page shows here again as soon as you’re back online.
          </p>
          <p className="research-web-tip">
            To read it with no connection, save it from your browser and{' '}
            <button className="text-link" onClick={onAddSaved}>
              add the saved page
            </button>
            .
          </p>
        </div>
      )}
    </>
  );
}
