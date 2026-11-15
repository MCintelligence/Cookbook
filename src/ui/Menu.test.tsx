// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Menu, type MenuItem } from './Menu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) act(() => r.unmount());
  document.body.innerHTML = '';
});

const items: MenuItem[] = [{ label: 'Move up', onPick: () => {} }];

/** A ⋮ button that opens a menu the way the Seasonings cards and Your Recipes do. */
function Harness({ withOpener }: { withOpener: boolean }) {
  const [menu, setMenu] = useState<{ opener?: HTMLElement } | null>(null);
  return (
    <>
      <button
        aria-label="More"
        onClick={(e) => {
          const opener = withOpener ? e.currentTarget : undefined;
          setMenu((open) => (opener && open?.opener === opener ? null : { opener }));
        }}
      />
      <button aria-label="Elsewhere" />
      {menu && <Menu items={items} x={0} y={0} label="Card" opener={menu.opener} onClose={() => setMenu(null)} />}
    </>
  );
}

function mount(withOpener: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<Harness withOpener={withOpener} />));
  return host;
}

/** A real mouse press: pointerdown first, then the click. */
function press(el: Element) {
  act(() => {
    el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const open = () => document.querySelectorAll('[role=menu]').length;

describe('a menu opened from a button', () => {
  it('closes on a second press of that button, and opens on a third', () => {
    const host = mount(true);
    const more = host.querySelector('[aria-label=More]')!;
    press(more);
    expect(open()).toBe(1);
    press(more);
    expect(open()).toBe(0);
    press(more);
    expect(open()).toBe(1);
  });

  it('still closes on a press anywhere else', () => {
    const host = mount(true);
    press(host.querySelector('[aria-label=More]')!);
    press(host.querySelector('[aria-label=Elsewhere]')!);
    expect(open()).toBe(0);
  });

  it('without its opener, a second press would close and reopen it (the old bug)', () => {
    const host = mount(false);
    const more = host.querySelector('[aria-label=More]')!;
    press(more);
    press(more);
    expect(open()).toBe(1);
  });
});

describe('on a phone', () => {
  const phone = () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    return () => {
      window.matchMedia = real;
    };
  };
  const nested: MenuItem[] = [
    { label: 'Rename', onPick: () => {} },
    { label: 'Move to', items: [{ label: 'Chapter two', onPick: () => {} }] },
  ];
  function Sheet({ onClosed }: { onClosed: () => void }) {
    const [open, setOpen] = useState(true);
    return open ? <Menu items={nested} x={0} y={0} label="Item" onClose={() => (setOpen(false), onClosed())} /> : null;
  }
  const mountSheet = () => {
    let closed = 0;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<Sheet onClosed={() => closed++} />));
    return { closed: () => closed };
  };
  const labels = () => Array.from(document.querySelectorAll('.menu-sheet [role^="menuitem"]')).map((b) => b.textContent?.replace('›', '').trim());
  const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

  it('is a sheet whose submenu takes its place, and Back steps out of the submenu before closing the sheet', () => {
    const restore = phone();
    try {
      const sheet = mountSheet();
      expect(document.querySelector('.menu-sheet-title')?.textContent).toBe('Item');
      expect(labels()).toEqual(['Rename', 'Move to']);
      act(() => (document.querySelector('.menu-sheet [aria-haspopup="menu"]') as HTMLElement).click());
      expect(document.querySelector('.menu-sheet-title')?.textContent).toBe('Move to');
      expect(labels()).toEqual(['Chapter two']);
      escape();
      expect(labels()).toEqual(['Rename', 'Move to']);
      expect(sheet.closed()).toBe(0);
      escape();
      expect(document.querySelector('.menu-sheet')).toBeNull();
      expect(sheet.closed()).toBe(1);
    } finally {
      restore();
    }
  });

  it('stays up when the keyboard sliding away resizes the window, and closes on a tap of the shade', () => {
    const restore = phone();
    try {
      const sheet = mountSheet();
      act(() => void window.dispatchEvent(new Event('resize')));
      expect(document.querySelector('.menu-sheet')).not.toBeNull();
      act(() => (document.querySelector('.menu-sheet-shade') as HTMLElement).click());
      expect(sheet.closed()).toBe(1);
    } finally {
      restore();
    }
  });
});
