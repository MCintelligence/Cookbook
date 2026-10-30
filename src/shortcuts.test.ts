import { describe, expect, it } from 'vitest';
import { bindingOf, commandFor } from './shortcuts';

/** A key press as the browser reports it; `key` is what the layout types, `code` the key's place on a US keyboard. */
const press = (key: string, code: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; altGr?: boolean } = {}) =>
  ({
    key,
    code,
    ctrlKey: !!mods.ctrl || !!mods.altGr,
    altKey: !!mods.alt || !!mods.altGr,
    shiftKey: !!mods.shift,
    metaKey: false,
    getModifierState: (m: string) => m === 'AltGraph' && !!mods.altGr,
  }) as unknown as KeyboardEvent;

describe('shortcuts', () => {
  it('go by the letter printed on the key', () => {
    // Dvorak: the key in QWERTY's V place types K.
    expect(bindingOf(press('k', 'KeyV', { ctrl: true }))).toBe('Mod-K');
    // AZERTY: A sits where QWERTY has Q.
    expect(commandFor(press('a', 'KeyQ', { ctrl: true }), ['palette'])).toBeNull();
    expect(commandFor(press('k', 'KeyK', { ctrl: true }), ['palette'])).toBe('palette');
  });

  it('fall back to the key’s place when it types no plain letter', () => {
    // Russian: the K place types л.
    expect(bindingOf(press('л', 'KeyK', { ctrl: true }))).toBe('Mod-K');
    // French digits need Shift, so digits go by place.
    expect(bindingOf(press('&', 'Digit1', { ctrl: true }))).toBe('Mod-1');
  });

  it('never treat AltGr as a shortcut', () => {
    // Polish AltGr+N types ń; Ctrl+Alt+N pressed on purpose is still a shortcut.
    expect(bindingOf(press('ń', 'KeyN', { altGr: true }))).toBeNull();
    expect(bindingOf(press('n', 'KeyN', { ctrl: true, alt: true }))).toBe('Mod-Alt-N');
  });

  it('save with Mod+S, and work from the number pad', () => {
    expect(commandFor(press('s', 'KeyS', { ctrl: true }), ['save'])).toBe('save');
    expect(bindingOf(press('1', 'Numpad1', { ctrl: true }))).toBe('Mod-1');
  });
});
