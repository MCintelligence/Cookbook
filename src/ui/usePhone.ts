import { useSyncExternalStore } from 'react';
import { isPhone } from '../mobile';

const subscribe = (changed: () => void) => {
  window.addEventListener('cookbook-device', changed);
  return () => window.removeEventListener('cookbook-device', changed);
};

/** Whether Cookbook is on a phone-sized touch screen right now (see mobile.ts); follows the phone being turned or unfolded. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
