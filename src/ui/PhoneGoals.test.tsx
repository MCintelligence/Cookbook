// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type WritingHistory, dayKey } from '../storage/history';
import { PhoneGoals } from './PhoneGoals';
import { danielPeriod, danielToday } from './danielCounts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const onGoals = vi.fn();
const onTab = vi.fn();
const today = dayKey(new Date());
const history: WritingHistory = new Map([[today, { written: 600, deleted: 100 }]]);

const render = (tab: 'targets' | 'history') =>
  act(() =>
    root.render(
      <PhoneGoals
        history={history}
        goals={{ dailyGoal: 1000, weekendsOff: false, bookTarget: 80000 }}
        onGoals={onGoals}
        scene={{ title: 'The Harbour', words: 1840, goal: 3000 }}
        onSceneGoal={() => {}}
        bookWords={40000}
        onExport={() => {}}
        tab={tab}
        onTab={onTab}
        onClose={() => {}}
      />,
    ),
  );

beforeEach(() => {
  onGoals.mockClear();
  onTab.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const tap = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const button = (text: string) => Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

describe('Goals on a phone', () => {
  it('leads with today: the ring, what is left, and Daniel’s word on it', () => {
    render('targets');
    expect(host.querySelector('.pg-ring-n')!.textContent).toBe('500');
    expect(host.querySelector('.pg-hero-sub')!.textContent).toBe('500 to go today');
    expect(host.querySelector('.pt-bubble')!.textContent).toContain('Drunk Daniel');
    expect(host.querySelectorAll('.pg-days li')).toHaveLength(7);
  });

  it('steps the daily goal with − and +, and turns weekends off', () => {
    render('targets');
    tap(host.querySelector('[aria-label="Raise daily goal"]'));
    expect(onGoals).toHaveBeenLastCalledWith({ dailyGoal: 1250 });
    tap(host.querySelector('[aria-label="Lower daily goal"]'));
    expect(onGoals).toHaveBeenLastCalledWith({ dailyGoal: 950 });
    tap(host.querySelector('[role="switch"]'));
    expect(onGoals).toHaveBeenLastCalledWith({ weekendsOff: true });
  });

  it('switches between Today and History', () => {
    render('targets');
    tap(button('History'));
    expect(onTab).toHaveBeenCalledWith('history');
  });

  it('shows a week as bars and a month as a calendar, and pages back but not past today', () => {
    render('history');
    expect(host.querySelector('.pg-period-label')!.textContent).toBe('This week');
    expect(host.querySelector('.pg-chart')).not.toBeNull();
    expect((host.querySelector('[aria-label="Later"]') as HTMLButtonElement).disabled).toBe(true);
    tap(button('Month'));
    expect(host.querySelector('.pg-cal')).not.toBeNull();
    const day = host.querySelector<HTMLButtonElement>('.pg-cal-d[data-today="true"]')!;
    tap(day);
    expect(host.querySelector('.pg-picked')!.textContent).toContain('500 words');
    tap(button('Year'));
    expect(host.querySelectorAll('.pg-col')).toHaveLength(12);
  });
});

describe('Daniel counting', () => {
  it('has a word for every kind of day, and the same one all day', () => {
    expect(danielToday(0, 1000, '2026-11-12')).toBe(danielToday(0, 1000, '2026-11-12'));
    expect(danielToday(1200, 1000, '2026-11-12')).not.toBe(danielToday(0, 1000, '2026-11-12'));
    expect(danielToday(300, 1000, '2026-11-13')).not.toMatch(/\{/);
  });
  it('compares a period with the one before, and never scolds an empty one', () => {
    expect(danielPeriod(0, 500, 'week', true, 'x')).toMatch(/day off|Quiet/);
    expect(danielPeriod(500, 0, 'week', true, 'x')).toMatch(/compare|Firsht/);
    expect(danielPeriod(2000, 1000, 'month', true, 'x')).toMatch(/lasht month/);
  });
});
