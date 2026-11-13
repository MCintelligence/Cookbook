import { useEffect, useRef, useState } from 'react';
import { NotesMarkdown } from './notesMarkdown';
import { isTauri } from '../storage/platform';
import { ANDROID_APP } from '../mobile';
import { getSettings } from '../settings';
import { checkDue, lastGoodCheck, untilMidnight, putOff, rememberGoodCheck, rememberLater } from './updateSchedule';

/**
 * A popup that tells the writer a new version of Cookbook is ready and installs it only
 * when they say so, after everything is saved. The desktop app checks the
 * project's signed GitHub releases; the browser version uses its service
 * worker. Nothing is ever installed or reloaded behind the writer's back.
 *
 * The popup shows over every part of the app, but waits until the writer
 * pauses typing. "Later" keeps it away for a day (or until "Check now" in
 * Cookbook Settings finds it again). See updateSchedule.ts for when checks run.
 */

interface Ready {
  version: string | null;
  notes: string | null;
  /** Downloads (on the desktop) and restarts into the new version. */
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
}

/** The first check waits this long after starting, then for an idle moment. */
const CHECK_AFTER_MS = 8_000;
/** How long the writer must stop typing before the popup appears. */
const QUIET_MS = 4_000;

export { putOff };

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
  // The Android app is updated the way it was installed: by a newer download from Cookbook's releases page.
  if (ANDROID_APP) return 'On Android, Cookbook updates when you install a newer version from its releases page. Your recipes stay where they are.';
  if (isTauri()) {
    const ready = await checkDesktop();
    rememberGoodCheck();
    if (!ready) return 'You have the latest version.';
    announce?.(ready);
    return `Cookbook ${ready.version} is ready. Choose “Update and restart” in the popup.`;
  }
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return 'This copy of Cookbook updates when the page reloads.';
  await registration.update();
  rememberGoodCheck();
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
    // The Android app is updated by installing a newer APK; it never looks for one itself.
    if (ANDROID_APP) return;
    let live = true;
    let busy = false;
    let lastTry = 0;
    /** One small request: the desktop asks GitHub's release feed, the browser its service worker. */
    let look: (() => Promise<void>) | null = null;
    // No polling loop: try once soon after starting, once at midnight, and when the
    // window or the network comes back, only if the last good check is old.
    const maybe = () => {
      const now = Date.now();
      if (!live || busy || !look || !getSettings().checkUpdates || !navigator.onLine || !checkDue(now, lastGoodCheck(), lastTry)) return;
      busy = true;
      lastTry = now;
      look().then(
        () => rememberGoodCheck(),
        () => {}, // Offline, or no releases yet: try again later, quietly.
      ).finally(() => {
        busy = false;
      });
    };
    const onShow = () => document.visibilityState === 'visible' && maybe();
    let idle = 0;
    const first = window.setTimeout(() => {
      // Wait for an idle moment too, so opening a recipe is never slowed.
      idle = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(maybe, { timeout: 10_000 }) : window.setTimeout(maybe, 0);
    }, CHECK_AFTER_MS);
    // At midnight, with the daily target, check again while Cookbook is open.
    // One timer a day, set again for the next midnight each time it fires.
    let night = 0;
    const atMidnight = () => {
      night = window.setTimeout(() => {
        maybe();
        atMidnight();
      }, untilMidnight(Date.now()));
    };
    atMidnight();
    window.addEventListener('focus', maybe);
    window.addEventListener('online', maybe);
    document.addEventListener('visibilitychange', onShow);

    if (isTauri()) {
      look = () => checkDesktop().then((r) => void (live && r && found(r)));
    } else if ('serviceWorker' in navigator) {
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
            if (registration) look = () => registration.update().then(() => {});
          },
        });
      }, () => {});
    }
    return () => {
      live = false;
      window.clearTimeout(first);
      window.clearTimeout(night);
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      window.clearTimeout(idle);
      window.removeEventListener('focus', maybe);
      window.removeEventListener('online', maybe);
      document.removeEventListener('visibilitychange', onShow);
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
