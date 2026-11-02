import { FONTS } from '../styles/styles';
import { askForSystemFonts, refreshSystemFonts, useFontList } from '../systemFonts';

const ASK = '\u0000system-fonts';
const REFRESH = '\u0000refresh-fonts';

/**
 * The options of a font menu: Cookbook's own fonts, then the ones installed on
 * this computer. A font the book uses that isn't here (written on another
 * computer) stays listed at the top, so the menu still shows it.
 */
export function FontOptions({ current }: { current: string }) {
  const { system, complete, canAsk } = useFontList();
  const listed = (FONTS as readonly string[]).includes(current) || system.includes(current);
  return (
    <>
      {!listed && <option value={current}>{complete ? `${current} (not installed)` : current}</option>}
      <optgroup label="Cookbook fonts">
        {FONTS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </optgroup>
      {system.length > 0 && (
        <optgroup label="On this computer">
          {system.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </optgroup>
      )}
      {canAsk && <option value={ASK}>Show all fonts on this computer…</option>}
      <option value={REFRESH}>Refresh fonts</option>
    </>
  );
}

/** Applies a pick from `FontOptions`, or asks the browser for every installed font, or looks again. */
export function pickFont(value: string, apply: (font: string) => void): void {
  if (value === ASK) void askForSystemFonts();
  else if (value === REFRESH) void refreshSystemFonts(true);
  else apply(value);
}

/** Give to a font `<select>` as `onFocus`, so fonts installed since show when it opens. */
export const lookForNewFonts = () => void refreshSystemFonts();
