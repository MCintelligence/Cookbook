import { memo } from 'react';
import { ModeIcon } from '../modes/ModeSwitch';
import { Icon } from './Icon';

/** The phone's five places. The three in the middle are the same Item seen three ways. */
export type PhoneTab = 'shelf' | 'cook' | 'prep' | 'plan' | 'pantry';

const TABS: { id: PhoneTab; name: string }[] = [
  { id: 'shelf', name: 'Shelf' },
  { id: 'cook', name: 'Cook' },
  { id: 'prep', name: 'Prep' },
  { id: 'plan', name: 'Plan' },
  { id: 'pantry', name: 'Pantry' },
];

/**
 * The bar along the bottom of a phone: where the writer is, and one tap to anywhere else, under
 * the thumb. It never hides while there is something to navigate; it only gives its place to the
 * keyboard.
 */
export const PhoneNav = memo(function PhoneNav({ tab, onTab }: { tab: PhoneTab; onTab: (tab: PhoneTab) => void }) {
  return (
    <nav className="phone-nav" aria-label="Cookbook">
      {TABS.map((t) => (
        <button key={t.id} type="button" data-phone-tab={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
          <span className="phone-nav-pill">{t.id === 'shelf' || t.id === 'pantry' ? <Icon name={t.id} size={22} /> : <ModeIcon mode={t.id} size={22} />}</span>
          {t.name}
        </button>
      ))}
    </nav>
  );
});
