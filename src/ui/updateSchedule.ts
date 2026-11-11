/**
 * When Cookbook looks for a new version on its own. There is no polling loop:
 * a check runs once a little after starting (once the app is idle), once at
 * midnight, when the daily target resets, and otherwise only when the window
 * comes back to the front or the computer comes back online, and then only if
 * the last good check is six hours old or from an earlier day. Each check is
 * one small request, so it costs nothing while the writer works.
 */

/** A good check counts for this long. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
/** After a failed check (offline, say), wait at least this long before trying again. */
export const RETRY_AFTER_MS = 15 * 60 * 1000;
/** "Later" keeps the popup away for this long; after that an automatic check shows it again. */
export const LATER_FOR_MS = 24 * 60 * 60 * 1000;

const CHECKED_KEY = 'cookbook.updateCheckedAt';
const LATER_KEY = 'cookbook.updateLater';

/** Whether an automatic check should run now, given when the last good check and the last try were. */
export function checkDue(now: number, lastGood: number, lastTry: number): boolean {
  const stale = now - lastGood >= CHECK_EVERY_MS || new Date(now).toDateString() !== new Date(lastGood).toDateString();
  return stale && now - lastTry >= RETRY_AFTER_MS;
}

/** Time until a second past the next local midnight, when the daily target resets too. */
export function untilMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now + 1000;
}

/** Whether the writer put this version off with "Later" a short while ago. */
export function laterStill(raw: string | null, version: string | null, now: number): boolean {
  if (!raw || !version) return false;
  try {
    const later = JSON.parse(raw) as { version?: unknown; at?: unknown };
    return later.version === version && typeof later.at === 'number' && now - later.at < LATER_FOR_MS;
  } catch {
    return false; // An older "Later" (just the version): let it ask again.
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the next start just checks again.
  }
}

export function lastGoodCheck(): number {
  return Number(read(CHECKED_KEY)) || 0;
}

export function rememberGoodCheck(now = Date.now()) {
  write(CHECKED_KEY, String(now));
}

export function putOff(version: string | null, now = Date.now()): boolean {
  return laterStill(read(LATER_KEY), version, now);
}

export function rememberLater(version: string | null, now = Date.now()) {
  if (version) write(LATER_KEY, JSON.stringify({ version, at: now }));
}
