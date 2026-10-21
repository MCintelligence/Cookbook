import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../storage/platform';

/**
 * Tells the writer a new version of Cookbook is ready and installs it only
 * when they say so, after everything is saved. The desktop app checks the
 * project's signed GitHub releases; the browser version uses its service
 * worker. Nothing is ever installed or reloaded behind the writer's back.
 */

interface Ready {
  version: string | null;
  notes: string | null;
  /** Downloads (on the desktop) and restarts into the new version. */
  install: (onProgress: (fraction: number | null) => void) => Promise<void>;
}

const CHECK_AFTER_MS = 8_000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

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

interface Props {
  /** Saves everything still in memory: the scene, undo history and index. */
  beforeRestart: () => Promise<void>;
}

export function UpdateBanner({ beforeRestart }: Props) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [later, setLater] = useState(false);
  const [notes, setNotes] = useState(false);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const saveRef = useRef(beforeRestart);
  saveRef.current = beforeRestart;

  useEffect(() => {
    if (isTauri()) {
      let live = true;
      const run = () =>
        checkDesktop().then(
          (r) => live && r && setReady(r),
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
          setReady({
            version: null,
            notes: null,
            install: () => reload(true),
          }),
        onRegisteredSW: (_url, registration) => {
          if (registration) window.setInterval(() => void registration.update().catch(() => {}), CHECK_EVERY_MS);
        },
      });
    }, () => {});
    return () => {
      live = false;
    };
  }, []);

  if (!ready || later) return null;

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
  const busy = progress !== undefined;

  return (
    <div className="update" role="status">
      <span className="update-text">
        <strong>{ready.version ? `Cookbook ${ready.version} is ready.` : 'A new version of Cookbook is ready.'}</strong>{' '}
        {busy
          ? progress === null || progress === 1
            ? 'Saving and restarting…'
            : `Downloading… ${Math.round(progress * 100)}%`
          : failed
            ? `The update didn’t install: ${failed}`
            : 'Your work is saved first, then Cookbook restarts.'}
      </span>
      {ready.notes && !busy && (
        <button className="pill" aria-expanded={notes} onClick={() => setNotes(!notes)}>
          What’s new
        </button>
      )}
      {!busy && (
        <>
          <button className="pill pill-accent" onClick={() => void install()}>
            {failed ? 'Try again' : 'Update and restart'}
          </button>
          <button className="pill" onClick={() => setLater(true)}>
            Later
          </button>
        </>
      )}
      {notes && ready.notes && <p className="update-notes">{ready.notes}</p>}
    </div>
  );
}
