// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goBack } from '../mobile';
import { getSettings, setSettings } from '../settings';
import { PhoneTable } from './PhoneTable';
import { tableSetBefore } from './tableSet';
import { PETE_ASKS, PETE_ON, payoff } from './tableVoices';

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
    expect(title()).toBe('Pull up a chair');
    next();
    expect(title()).toBe('What’s cooking?');
    next();
    expect(title()).toBe('Whose name goes on the cover?');
    next();
    expect(title()).toBe('Which English do you write?');
    tap(row('British'));
    expect(row('British')!.getAttribute('aria-checked')).toBe('true');
    next();
    expect(getSettings().english).toBe('en-GB');
    expect(title()).toBe('How should it look?');
  });

  it('has the host ask, then answer back once the writer picks', () => {
    next();
    expect(host.querySelector('.pt-bubble')!.textContent).toContain(PETE_ASKS);
    tap(Array.from(host.querySelectorAll('.pt-tile')).find((t) => t.textContent?.includes('A journal')));
    expect(host.querySelector('.pt-bubble')!.textContent).toContain(PETE_ON.journal);
    next();
    expect(getSettings().writer).toBe('journal');
  });

  it('puts the name on the title page as it is typed', () => {
    next();
    next();
    const input = host.querySelector<HTMLInputElement>('.pt-input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ada Lovelace');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('.pt-tp-by')!.textContent).toBe('by Ada Lovelace');
    next();
    expect(getSettings().writerName).toBe('Ada Lovelace');
  });

  it('goes back a question with the arrow and with the phone’s Back, and leaves from the first', () => {
    next();
    next();
    tap(host.querySelector('[aria-label="Back"]'));
    expect(title()).toBe('What’s cooking?');
    act(() => void goBack());
    expect(title()).toBe('Pull up a chair');
    expect(host.querySelector('[aria-label="Back"]')).toBeNull();
    act(() => void goBack());
    expect(done).toHaveBeenCalledTimes(1);
    expect(tableSetBefore()).toBe(true);
  });

  it('can be put off from the first screen', () => {
    tap(host.querySelector('.pt-later'));
    expect(done).toHaveBeenCalledTimes(1);
    expect(tableSetBefore()).toBe(true);
  });

  it('skips a question without changing its answer, and finishes on the last screen', () => {
    setSettings({ dailyGoal: 750 });
    for (let i = 0; i < 5; i++) next();
    expect(title()).toBe('How many words a day?');
    tap(Array.from(host.querySelectorAll('.pt-chips button')).find((b) => b.textContent === '2,000'));
    tap(host.querySelector('.pt-skip'));
    expect(getSettings().dailyGoal).toBe(750);
    expect(title()).toBe('Who reads over your shoulder?');
    next();
    expect(title()).toContain('The table’s set');
    next();
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('what a daily goal makes', () => {
  const today = new Date(2026, 10, 12);
  it('says when a first draft would be done', () => {
    expect(payoff(1667, 'novel', today)).toBe('That’s a novel’s first draft by 30 December.');
    expect(payoff(1000, 'novel', today)).toBe('That’s a novel’s first draft by 31 January 2027.');
    expect(payoff(500, 'short', today)).toBe('That’s a short story in 10 days.');
  });
  it('counts a year of words when there is no draft to finish', () => {
    expect(payoff(250, 'journal', today)).toBe('That’s 91,250 words by this time next year.');
    expect(payoff(0, 'novel', today)).toContain('No goal');
  });
});
