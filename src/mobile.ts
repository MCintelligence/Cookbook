import { isTauri } from './storage/platform';

/**
 * What a phone or tablet needs that a desktop doesn't: knowing a finger is doing the pointing,
 * a Back button that closes whatever is open, and (in the Android app) a few things only the
 * system can do, which MainActivity.kt offers as `window.CookbookAndroid`.
 */

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
export const IS_ANDROID = /Android/i.test(ua);
/** The Android app, rather than Cookbook open in a phone's browser. */
export const ANDROID_APP = isTauri() && IS_ANDROID;

const media = (query: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null);
const TOUCH = '(pointer: coarse)';
/** A phone held either way up: a narrow screen, or a short one, worked by touch. */
const PHONE = `${TOUCH} and (max-width: 700px), ${TOUCH} and (max-height: 500px)`;

/** Whether a finger does the pointing: targets grow, hover hints go, and a long press picks words as it does everywhere else on the device. */
export const isTouch = () => media(TOUCH)?.matches ?? false;
/** Whether this is a phone-sized touch screen: menus rise from the bottom, panels fill the screen, formatting sits above the keyboard. */
export const isPhone = () => media(PHONE)?.matches ?? false;

/** Whether a menu or long press came from a finger rather than a mouse. */
export const fromTouch = (e: { nativeEvent: Event } | Event): boolean => {
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  const kind = (native as PointerEvent).pointerType;
  // Android reports a long press as a context menu from 'touch'; where it says nothing, a touch screen is taken at its word.
  return kind ? kind === 'touch' || kind === 'pen' : isTouch();
};

interface AndroidBridge {
  setBars?: (colour: string, lightBackground: boolean) => void;
  leave?: () => void;
  print?: (html: string, title: string) => void;
}
const bridge = (): AndroidBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { CookbookAndroid?: AndroidBridge }).CookbookAndroid);

/** Colours the strips behind the status bar and the navigation bar to match the app's own bars, and picks dark or light icons to suit. */
export function setSystemBars(rgb: [number, number, number]): void {
  const hex = `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140;
  try {
    bridge()?.setBars?.(hex, light);
  } catch {
    // An older shell without the bridge keeps the theme's own colours.
  }
}

/** Whether the Android app can print (and so save a PDF) through the system's print screen. */
export const canPrintNatively = () => typeof bridge()?.print === 'function';
export function printNatively(html: string, title: string): void {
  bridge()!.print!(html, title);
}

/** Keeps `phone` and `touch` on <html> for the stylesheet, and tells whoever asks when they change. */
export function watchDevice(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('touch', isTouch());
    root.classList.toggle('phone', isPhone());
    root.classList.toggle('android-app', ANDROID_APP);
    window.dispatchEvent(new Event('cookbook-device'));
  };
  apply();
  for (const q of [TOUCH, PHONE]) media(q)?.addEventListener?.('change', apply);
}

// ---------- Back ----------

type Closer = () => boolean;
const closers: Closer[] = [];

/** Something the Back button can put away. `close` returns true when it had something open and closed it. The newest is asked first. */
export function onBack(close: Closer): () => void {
  closers.push(close);
  return () => {
    const i = closers.lastIndexOf(close);
    if (i !== -1) closers.splice(i, 1);
  };
}

/** Whatever floats over the app and closes on Escape: menus, sheets, dialogs, pop-ups and full-screen windows. */
const OVERLAYS = '.menu, [role="dialog"], [aria-modal="true"], .palette, .settings, .insert-menu, .find-pop, .goals-pop, .tb-popover';

/**
 * What Back does, in the order a writer expects: the topmost thing that floats over the app
 * closes first (as Escape would close it), then whatever the app itself has slid out.
 * Returns false when nothing was open, which is when Back should leave the app.
 */
export function goBack(): boolean {
  const open = Array.from(document.querySelectorAll<HTMLElement>(OVERLAYS)).filter((el) => el.getClientRects().length > 0);
  const top = open[open.length - 1];
  if (top) {
    const active = document.activeElement as HTMLElement | null;
    const from = active && top.contains(active) ? active : top;
    from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    return true;
  }
  for (let i = closers.length - 1; i >= 0; i--) if (closers[i]!()) return true;
  return false;
}

/**
 * Wires the device's Back button or gesture to goBack. The Android app is told about Back by
 * Tauri; a phone's browser (and the app, should that fail) gets the same through one spare
 * entry in the page's history, which Back spends and Cookbook puts back.
 */
export function watchBack(): void {
  if (typeof window === 'undefined') return;
  const leave = () => {
    try {
      bridge()?.leave?.();
    } catch {
      // Nothing to leave to.
    }
  };
  const viaHistory = () => {
    if (!isTouch()) return;
    const mark = { cookbookBack: true };
    const arm = () => {
      if (!(history.state as { cookbookBack?: boolean } | null)?.cookbookBack) history.pushState(mark, '');
    };
    arm();
    window.addEventListener('popstate', () => {
      if (goBack()) return arm();
      if (ANDROID_APP) {
        // The app steps aside like any other, and is as it was when the writer comes back.
        arm();
        leave();
      }
    });
  };
  if (!ANDROID_APP) return viaHistory();
  void import('@tauri-apps/api/app')
    .then(({ onBackButtonPress }) => onBackButtonPress(() => void (goBack() || leave())))
    .catch(viaHistory);
}

/** How a row's menu is opened here, to start a hint with: "Right-click" with a mouse, "Press and hold" with a finger. */
export const menuPress = () => (isTouch() ? 'Press and hold' : 'Right-click');
