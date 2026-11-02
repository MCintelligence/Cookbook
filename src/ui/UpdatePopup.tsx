import { useEffect, useRef, useState } from 'react';
import { NotesMarkdown } from './notesMarkdown';
import { isTauri } from '../storage/platform';
import { getSettings } from '../settings';

/**
 * A popup that tells the writer a new version of Cookbook is ready and installs it only
 * when they say so, after everything is saved. The desktop app checks the
 * project's signed GitHub releases; the browser version uses its service
 * worker. Nothing is ever installed or reloaded behind the writer's back.
 *
 * The popup shows over every part of the app, but waits until the writer
 * pauses typing, and shows once per version: "Later" keeps it away until
 * the next version (or until "Check now" in App Settings finds it again).
 */

interface Ready {
  version: string | null;
  notes: string | null;
  /** Downloads (on the desktop) and restarts into the new version. */
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
}

const CHECK_AFTER_MS = 8_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** How long the writer must stop typing before the popup appears. */
const QUIET_MS = 4_000;
const LATER_KEY = 'cookbook.updateLater';

/** The version the writer put off with "Later", so automatic checks don't ask again. */
export function putOff(version: string | null): boolean {
  try {
    return !!version && localStorage.getItem(LATER_KEY) === version;
  } catch {
    return false;
  }
}

function rememberLater(version: string | null) {
  try {
    if (version) localStorage.setItem(LATER_KEY, version);
  } catch {
    // Private mode: the popup just comes back next time.
  }
}

async function checkDesktop(): Promise<Ready | null> {
  const [{ check }, { relaunch }] = await Promise.all([import('@tauri-apps/plugin-updater'), import('@tauri-apps/plugin-process')]);
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body?.trim() || null,
    install: async (onProgress) => {
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          onProgress(total > 0 ? Math.min(1, done / total) : null);
        }
      });
      await relaunch();
    },
  };
}

/** The popup, told when "Check now" in Settings finds an update. */
let announce: ((ready: Ready) => void) | null = null;

/** Looks for a new version now, from Settings, and says what it found. */
export async function checkForUpdates(): Promise<string> {
  if (isTauri()) {
    const ready = await checkDesktop();
    if (!ready) return 'You have the latest version.';
    announce?.(ready);
    return `Cookbook ${ready.version} is ready. Choose “Update and restart” in the popup.`;
  }
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return 'This copy of Cookbook updates when the page reloads.';
  await registration.update();
  return registration.waiting || registration.installing ? 'A new version is ready. Choose “Update and restart” in the popup.' : 'You have the latest version.';
}

interface Props {
  /** Saves everything still in memory: the scene, undo history and index. */
  beforeRestart: () => Promise<void>;
}

export function UpdatePopup({ beforeRestart }: Props) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [later, setLater] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const saveRef = useRef(beforeRestart);
  saveRef.current = beforeRestart;
  const lastKey = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    announce = (r) => {
      setReady(r);
      setLater(false);
      setQuiet(true); // Asked for by hand: show it straight away.
    };
    return () => {
      announce = null;
    };
  }, []);

  // Found by an automatic check: show it unless the writer already said "Later" to this version.
  const found = (r: Ready) => {
    if (putOff(r.version)) return;
    setReady(r);
  };

  useEffect(() => {
    if (isTauri()) {
      let live = true;
      // Settings can turn automatic checks off; "Check now" there still works.
      const run = () =>
        getSettings().checkUpdates &&
        checkDesktop().then(
          (r) => live && r && found(r),
          () => {}, // Offline, or no releases yet: try again later.
        );
      const first = window.setTimeout(run, CHECK_AFTER_MS);
      const every = window.setInterval(run, CHECK_EVERY_MS);
      return () => {
        live = false;
        window.clearTimeout(first);
        window.clearInterval(every);
      };
    }
    if (!('serviceWorker' in navigator)) return;
    let live = true;
    import('virtual:pwa-register').then(({ registerSW }) => {
      const reload = registerSW({
        onNeedRefresh: () =>
          live &&
          found({
            version: null,
            notes: null,
            install: () => reload(true),
          }),
        onRegisteredSW: (_url, registration) => {
          if (registration) window.setInterval(() => getSettings().checkUpdates && void registration.update().catch(() => {}), CHECK_EVERY_MS);
        },
      });
    }, () => {});
    return () => {
      live = false;
    };
  }, []);

  // Never pop up mid-sentence: wait until the keyboard has been quiet for a moment.
  useEffect(() => {
    const typed = () => {
      lastKey.current = Date.now();
    };
    window.addEventListener('keydown', typed, true);
    return () => window.removeEventListener('keydown', typed, true);
  }, []);
  useEffect(() => {
    if (!ready || later || quiet) return;
    let timer = 0;
    const wait = () => {
      const left = lastKey.current + QUIET_MS - Date.now();
      if (left <= 0) setQuiet(true);
      else timer = window.setTimeout(wait, left);
    };
    wait();
    return () => window.clearTimeout(timer);
  }, [ready, later, quiet]);

  const open = !!ready && !later && quiet;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.pill-accent')?.focus();
    return () => {
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const busy = progress !== undefined;
  const putItOff = () => {
    if (busy) return;
    rememberLater(ready.version);
    setLater(true);
    setQuiet(false);
  };
  const install = async () => {
    setFailed(null);
    setProgress(null);
    try {
      await saveRef.current();
      await ready.install(setProgress);
    } catch (e) {
      setProgress(undefined);
      setFailed(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="lib-backdrop update-backdrop" onMouseDown={(e) => e.target === e.currentTarget && putItOff()}>
      <div
        className="lib update-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        ref={box}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            putItOff();
          }
        }}
      >
        <div className="lib-head">
          <h2 id="update-title">{ready.version ? `Cookbook ${ready.version} is ready` : 'A new version of Cookbook is ready'}</h2>
        </div>
        {ready.notes && (
          <div className="update-notes" aria-label="What’s new">
            <NotesMarkdown source={ready.notes} />
          </div>
        )}
        <p className="update-status" role="status">
          {busy
            ? progress === null || progress === 1
              ? 'Saving and restarting…'
              : `Downloading… ${Math.round(progress * 100)}%`
            : failed
              ? `The update didn’t install: ${failed}`
              : 'Your work is saved first, then Cookbook restarts.'}
        </p>
        <div className="update-actions">
          <button className="pill" onClick={putItOff} disabled={busy}>
            Later
          </button>
          <button className="pill pill-accent" onClick={() => void install()} disabled={busy}>
            {failed ? 'Try again' : 'Update and restart'}
          </button>
        </div>
      </div>
    </div>
  );
}
