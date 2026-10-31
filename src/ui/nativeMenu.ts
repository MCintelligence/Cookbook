import { type MenuItem } from './Menu';
import { type BarMenu } from './MenuBar';

/** What the Mac's own menu bar is built from: plain data, so it can be tested without Tauri. */
export type NativeItem =
  | { item: 'Separator' | 'Undo' | 'Redo' | 'Cut' | 'Copy' | 'Paste' | 'SelectAll' | 'Services' | 'Hide' | 'HideOthers' | 'ShowAll' | 'Minimize' | 'Fullscreen' | 'CloseWindow' }
  | { text: string; items: NativeItem[]; enabled?: boolean }
  | { id: string; text: string; enabled?: boolean; checked?: boolean; accelerator?: string };

/** "Mod-Shift-F" as the system writes it: "CmdOrCtrl+Shift+F". */
export function accelerator(binding: string | undefined): string | undefined {
  if (!binding) return undefined;
  return binding
    .split('-')
    .map((part) => (part === 'Mod' ? 'CmdOrCtrl' : part === 'Ctrl' ? 'Control' : part))
    .join('+');
}

/**
 * The menus as the Mac's menu bar shows them. Each item's id is the path of
 * labels to it, so picking it runs the menu as it is then, never as it was
 * when the bar was built. Undo, Cut, Copy and the like are the system's own,
 * so they work in text boxes too. Ticks that follow the cursor, such as the
 * paragraph style, are left off: the bar can't change while it is open.
 */
export function nativeItems(menus: BarMenu[], live: Set<string> = new Set(['Format'])): NativeItem[] {
  const convert = (items: MenuItem[], trail: string[], ticks: boolean): NativeItem[] =>
    items.flatMap((m): NativeItem[] => {
      if ('separator' in m) return [{ item: 'Separator' }];
      if ('heading' in m) return [{ id: [...trail, m.heading].join('\u0000'), text: m.heading, enabled: false }];
      if ('items' in m) return [{ text: m.label, enabled: !m.disabled, items: convert(m.items, [...trail, m.label], ticks) }];
      if (m.native) return [{ item: m.native }];
      return [
        {
          id: [...trail, m.label].join('\u0000'),
          text: m.label,
          enabled: !m.disabled,
          ...(ticks && m.checked !== undefined && { checked: m.checked }),
          ...(m.binding && { accelerator: accelerator(m.binding) }),
        },
      ];
    });
  return menus.map((m) => ({ text: m.label, items: convert(m.items(), [m.label], !live.has(m.label)) }));
}

/** Runs the item an id names, in the menus as they are now. */
export function runNative(menus: BarMenu[], id: string): void {
  const [top, ...rest] = id.split('\u0000');
  let items = menus.find((m) => m.label === top)?.items() ?? [];
  for (const [i, label] of rest.entries()) {
    const found = items.find((m) => 'label' in m && m.label === label);
    if (!found || !('label' in found)) return;
    if ('items' in found) items = found.items;
    else if (i === rest.length - 1 && !found.disabled) return found.onPick();
    else return;
  }
}

/** Puts the menus in the Mac's own menu bar, with Cookbook's app menu first and Window before Help. */
export async function setMacMenu(menus: BarMenu[], latest: () => BarMenu[], app: { settings: () => void; quit: () => void }): Promise<void> {
  const { Menu } = await import('@tauri-apps/api/menu');
  const action = (id: string) => runNative(latest(), id);
  const withActions = (items: NativeItem[]): unknown[] =>
    items.map((n) => ('items' in n ? { ...n, items: withActions(n.items) } : 'id' in n ? { ...n, action } : n));
  const ours = nativeItems(menus);
  const found = ours.findIndex((m) => 'text' in m && m.text === 'Help');
  const help = found === -1 ? ours.length : found;
  const cookbook = {
    text: 'Cookbook',
    items: [
      { item: { About: null } },
      { item: 'Separator' },
      { id: 'app-settings', text: 'Settings…', accelerator: 'CmdOrCtrl+,', action: app.settings },
      { item: 'Separator' },
      { item: 'Services' },
      { item: 'Separator' },
      { item: 'Hide' },
      { item: 'HideOthers' },
      { item: 'ShowAll' },
      { item: 'Separator' },
      // Quitting closes the window first, so the page saves the last words typed.
      { id: 'app-quit', text: 'Quit Cookbook', accelerator: 'CmdOrCtrl+Q', action: app.quit },
    ],
  };
  const window = { text: 'Window', items: [{ item: 'Minimize' }, { item: 'Fullscreen' }, { item: 'Separator' }, { item: 'CloseWindow' }] };
  const items = [cookbook, ...withActions(ours.slice(0, help)), window, ...withActions(ours.slice(help))];
  const menu = await Menu.new({ items: items as never });
  const before = await menu.setAsAppMenu();
  await before?.close().catch(() => {});
}
