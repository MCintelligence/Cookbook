/**
 * Turns what the file system or the browser throws into a sentence a writer
 * can act on. The original text is kept at the end for bug reports.
 */
const RULES: [RegExp, string][] = [
  [/forbidden path|not allowed|scope|permission denied|EACCES|EPERM|NotAllowedError|SecurityError/i,
    "Cookbook isn't allowed to use that folder. Pick a folder in your home or Documents folder, or check its permissions."],
  [/ENOSPC|no space|QuotaExceeded|quota/i, "There's no room left to save. Free up some disk space and try again."],
  [/ENOENT|not found|NotFoundError|no such file|cannot find/i, "That file or folder isn't there any more. It may have been moved, renamed or deleted."],
  [/EEXIST|already exists/i, 'Something with that name is already there. Try a different name.'],
  [/EROFS|read-only|NoModificationAllowedError/i, 'That folder is read-only, so Cookbook can\'t save there.'],
  [/InvalidStateError|locked|EBUSY/i, 'Another app or window is using that file. Close it and try again.'],
];

export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  for (const [pattern, message] of RULES) if (pattern.test(raw) || pattern.test(e instanceof Error ? e.name : '')) return `${message} (${raw})`;
  return raw;
}
