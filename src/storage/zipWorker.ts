/// <reference lib="webworker" />
import { type ZipEntry, zipEntries } from './zip';

/** Zips a book away from the window, for backups. */
self.onmessage = (e: MessageEvent<ZipEntry[]>) => {
  try {
    const zip = zipEntries(e.data);
    self.postMessage({ zip }, [zip.buffer as ArrayBuffer]);
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
