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
