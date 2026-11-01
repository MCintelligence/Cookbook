import { unzipSync, zipSync, type Zippable } from 'fflate';

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

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * What is wrong with a zip read back from disk, or null if it opens and holds
 * exactly `entries`, byte for byte.
 */
export function zipProblem(zip: Uint8Array, entries: ZipEntry[]): string | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch (e) {
    return `it won’t open (${e instanceof Error ? e.message : String(e)})`;
  }
  for (const e of entries) {
    const got = files[e.name];
    if (!got) return `“${e.name}” is missing from it`;
    if (!sameBytes(got, e.data)) return `“${e.name}” in it doesn’t match the recipe`;
  }
  const extra = Object.keys(files).length - entries.length;
  return extra > 0 ? `it holds ${extra} more ${extra === 1 ? 'file' : 'files'} than the recipe` : null;
}

/** What the zip worker is asked to do: zip some files, or check a zip read back holds them. */
export type ZipJob = { zip: ZipEntry[] } | { check: Uint8Array; entries: ZipEntry[] };
export type ZipAnswer = { zip: Uint8Array } | { problem: string | null } | { error: string };

/** How long to wait for the worker before doing the job in place instead. */
const WORKER_WAIT_MS = 60_000;

/**
 * Runs a job in a worker, so a big book with pictures doesn't freeze the window.
 * Where there are no workers (tests), or one can't start, it runs in place.
 */
async function inBackground<T>(job: ZipJob, inPlace: () => T, read: (answer: ZipAnswer) => T | undefined): Promise<T> {
  if (typeof Worker === 'undefined') return inPlace();
  let worker: Worker;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    worker = new Worker(new URL('./zipWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return inPlace();
  }
  try {
    // The files are copied to the worker rather than handed over, so doing it in place still works if it fails.
    return await new Promise<T>((resolve, reject) => {
      // A worker that never answers mustn't hold up closing the app, which waits for its backup.
      timer = setTimeout(() => reject(new Error('The zip worker didn’t answer.')), WORKER_WAIT_MS);
      worker.onmessage = (e: MessageEvent<ZipAnswer>) => {
        const answer = read(e.data);
        if (answer === undefined) reject(new Error('error' in e.data ? e.data.error : 'The zip worker answered something else.'));
        else resolve(answer);
      };
      worker.onerror = () => reject(new Error('The zip worker stopped.'));
      worker.postMessage(job);
    });
  } catch {
    return inPlace();
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}

export function zipInBackground(entries: ZipEntry[]): Promise<Uint8Array> {
  return inBackground({ zip: entries }, () => zipEntries(entries), (a) => ('zip' in a ? a.zip : undefined));
}

/** zipProblem, away from the window: unzipping a big book takes a moment too. */
export function zipProblemInBackground(zip: Uint8Array, entries: ZipEntry[]): Promise<string | null> {
  return inBackground({ check: zip, entries }, () => zipProblem(zip, entries), (a) => ('problem' in a ? a.problem : undefined));
}
