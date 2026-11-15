// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let phone = true;
vi.mock('../ui/usePhone', () => ({ usePhone: () => phone }));
const { Pick } = await import('./shared');

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  phone = true;
});

const views = [
  { id: 'outline', name: 'Outline' },
  { id: 'board', name: 'Board' },
] as const;

describe('a pick on a phone', () => {
  it('lays a short choice out whole, the picked one marked', () => {
    const pick = vi.fn();
    act(() => root.render(<Pick label="Prep view" value="outline" options={[...views]} onPick={pick} />));
    const buttons = host.querySelectorAll<HTMLButtonElement>('.phone-seg button[role="radio"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('aria-checked')).toBe('true');
    act(() => buttons[1]!.click());
    expect(pick).toHaveBeenCalledWith('board');
    expect(host.querySelector('select')).toBeNull();
  });

  it('keeps a pulldown for a long choice, and on a computer', () => {
    const long = [
      { id: 'none', name: 'One row' },
      { id: 'label', name: 'Rows by plotline' },
      { id: 'status', name: 'Rows by status' },
    ];
    act(() => root.render(<Pick label="Rows" value="none" options={long} onPick={() => {}} />));
    expect(host.querySelector('select')).not.toBeNull();
    phone = false;
    act(() => root.render(<Pick label="Prep view" value="outline" options={[...views]} onPick={() => {}} key="desk" />));
    expect(host.querySelector('.phone-seg')).toBeNull();
    expect(host.querySelector('select')).not.toBeNull();
  });
});
