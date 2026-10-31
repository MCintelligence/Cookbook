/// <reference lib="webworker" />
import { type ZipAnswer, type ZipJob, zipEntries, zipProblem } from './zip';

/** Zips a book away from the window for backups, and checks a backup read back holds the whole book. */
self.onmessage = (e: MessageEvent<ZipJob>) => {
  const answer = (a: ZipAnswer, moved: Transferable[] = []) => self.postMessage(a, moved);
  try {
    if ('check' in e.data) answer({ problem: zipProblem(e.data.check, e.data.entries) });
    else {
      const zip = zipEntries(e.data.zip);
      answer({ zip }, [zip.buffer as ArrayBuffer]);
    }
  } catch (err) {
    answer({ error: err instanceof Error ? err.message : String(err) });
  }
};
