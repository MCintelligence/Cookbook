import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { watchLook } from './settings';
import { matchWindowToBars } from './ui/windowColour';
import './fonts';
import './styles.css';

// The theme is on the page before anything is drawn, so a dark theme never flashes light.
watchLook();
matchWindowToBars();

// The window itself never scrolls (styles.css pins the app to it). If something still scrolls it,
// such as the caret being kept in view or a hard trackpad scroll, it goes straight back, so the top
// bar can never slide up under a Mac's title bar.
window.addEventListener('scroll', () => (window.scrollX !== 0 || window.scrollY !== 0) && window.scrollTo(0, 0), { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
