import { describe, expect, it, vi } from 'vitest';
import { accelerator, nativeItems, runNative, setMacMenu } from './nativeMenu';

const built = vi.hoisted(() => ({ items: [] as { text?: string; items?: { id?: string; action?: (id: string) => void }[] }[], closed: 0 }));
vi.mock('@tauri-apps/api/menu', () => ({
  Menu: {
    new: async (opts: { items: typeof built.items }) => {
      built.items = opts.items;
      return { setAsAppMenu: async () => ({ close: async () => void built.closed++ }) };
    },
  },
}));
import { type BarMenu } from './MenuBar';

describe('the Mac menu bar', () => {
  it('writes shortcuts as the system does', () => {
    expect(accelerator('Mod-Shift-F')).toBe('CmdOrCtrl+Shift+F');
    expect(accelerator('Mod-Alt-N')).toBe('CmdOrCtrl+Alt+N');
    expect(accelerator(undefined)).toBeUndefined();
  });

  it('turns the menus into the system’s, with its own Undo and no ticks that follow the cursor', () => {
    const menus: BarMenu[] = [
      { label: 'Edit', items: () => [{ label: 'Undo', native: 'Undo', onPick: () => {} }, { separator: true }, { label: 'Search', binding: 'Mod-F', onPick: () => {} }] },
      { label: 'Format', items: () => [{ label: 'Paragraph style', items: [{ label: 'Body', checked: true, onPick: () => {} }] }] },
      { label: 'View', items: () => [{ label: 'Typewriter scrolling', checked: false, disabled: true, onPick: () => {} }] },
    ];
    expect(nativeItems(menus)).toEqual([
      { text: 'Edit', items: [{ item: 'Undo' }, { item: 'Separator' }, { id: 'Edit\u0000Search', text: 'Search', enabled: true, accelerator: 'CmdOrCtrl+F' }] },
      { text: 'Format', items: [{ text: 'Paragraph style', enabled: true, items: [{ id: 'Format\u0000Paragraph style\u0000Body', text: 'Body', enabled: true }] }] },
      { text: 'View', items: [{ id: 'View\u0000Typewriter scrolling', text: 'Typewriter scrolling', enabled: false, checked: false }] },
    ]);
  });

  it('runs the item as the menus are now, and never a disabled one', () => {
    const now = vi.fn();
    const off = vi.fn();
    const menus: BarMenu[] = [{ label: 'View', items: () => [{ label: 'Zoom', items: [{ label: '100%', onPick: now }, { label: '200%', disabled: true, onPick: off }] }] }];
    runNative(menus, 'View\u0000Zoom\u0000100%');
    runNative(menus, 'View\u0000Zoom\u0000200%');
    runNative(menus, 'View\u0000Gone');
    expect(now).toHaveBeenCalledOnce();
    expect(off).not.toHaveBeenCalled();
  });
});

describe('setMacMenu', () => {
  it('puts Cookbook first and Window before Help, runs picks on the latest menus and closes the old bar', async () => {
    const first = vi.fn();
    const later = vi.fn();
    const menus = (pick: () => void): BarMenu[] => [
      { label: 'File', items: () => [{ label: 'New item', onPick: pick }] },
      { label: 'Help', items: () => [{ label: 'Keyboard shortcuts…', onPick: () => {} }] },
    ];
    let latest = menus(first);
    await setMacMenu(latest, () => latest, { settings: () => {}, quit: () => {} });
    expect(built.items.map((m) => m.text)).toEqual(['Cookbook', 'File', 'Window', 'Help']);
    latest = menus(later);
    const item = built.items[1]!.items![0]!;
    item.action!(item.id!);
    expect(first).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledOnce();
    expect(built.closed).toBe(1);
  });
});
