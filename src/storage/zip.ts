import { zipSync, type Zippable } from 'fflate';

/** One file or folder (a name ending in /) for a zip, with how hard to compress it. */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** 0 stores it as it is: pictures and other zips are already compressed. */
  level: 0 | 6;
}

export function zipEntries(entries: ZipEntry[]): Uint8Array {
  const files: Zippable = {};
  for (const e of entries) files[e.name] = [e.data, { level: e.level }];
  return zipSync(files);
}

/** How long to wait for the worker before zipping in place instead. */
const WORKER_WAIT_MS = 60_000;

/**
 * Zips in a worker, so a big book with pictures doesn't freeze the window.
 * Where there are no workers (tests), or one can't start, it zips in place.
 */
export async function zipInBackground(entries: ZipEntry[]): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return zipEntries(entries);
  let worker: Worker;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new Worker(new URL('./zipWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return zipEntries(entries);
  }
  try {
    // The files are copied to the worker rather than handed over, so zipping in place still works if it fails.
    return await new Promise<Uint8Array>((resolve, reject) => {
      // A worker that never answers mustn't hold up closing the app, which waits for its backup.
      timer = setTimeout(() => reject(new Error('The zip worker didn’t answer.')), WORKER_WAIT_MS);
      worker.onmessage = (e: MessageEvent<{ zip: Uint8Array } | { error: string }>) => ('zip' in e.data ? resolve(e.data.zip) : reject(new Error(e.data.error)));
      worker.onerror = () => reject(new Error('The zip worker stopped.'));
      worker.postMessage(entries);
    });
  } catch {
    return zipEntries(entries);
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}
