// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goBack } from '../mobile';
import { getSettings, setSettings } from '../settings';
import { PhoneTable } from './PhoneTable';
import { tableSetBefore } from './tableSet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const done = vi.fn();

beforeEach(() => {
  localStorage.clear();
  done.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<PhoneTable first onDone={done} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const title = () => host.querySelector('h1')!.textContent;
const tap = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const next = () => act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
const row = (name: string) => Array.from(host.querySelectorAll('.pt-row')).find((r) => r.textContent?.includes(name));

describe('Set the Table on a phone', () => {
  it('asks one question to a screen and keeps each answer as the writer moves on', () => {
    expect(title()).toBe('Welcome to Cookbook');
    next();
    expect(title()).toBe('Which English do you write?');
    tap(row('British'));
    expect(row('British')!.getAttribute('aria-checked')).toBe('true');
    next();
    expect(getSettings().english).toBe('en-GB');
    expect(title()).toBe('What do you mostly write?');
  });

  it('goes back a question with the arrow and with the phone’s Back, and leaves from the first', () => {
    next();
    next();
    tap(host.querySelector('[aria-label="Back"]'));
    expect(title()).toBe('Which English do you write?');
    act(() => void goBack());
    expect(title()).toBe('Welcome to Cookbook');
    expect(host.querySelector('[aria-label="Back"]')).toBeNull();
    act(() => void goBack());
    expect(done).toHaveBeenCalledTimes(1);
    expect(tableSetBefore()).toBe(true);
  });

  it('skips a question without changing its answer, and finishes on the last screen', () => {
    setSettings({ dailyGoal: 750 });
    for (let i = 0; i < 4; i++) next();
    expect(title()).toBe('How many words a day?');
    tap(Array.from(host.querySelectorAll('.pt-chips button')).find((b) => b.textContent === '2,000'));
    tap(host.querySelector('.pt-skip'));
    expect(getSettings().dailyGoal).toBe(750);
    next();
    expect(title()).toContain('Your table is set');
    next();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
