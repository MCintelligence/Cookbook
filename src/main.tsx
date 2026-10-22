import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { watchLook } from './settings';
import './fonts';
import './styles.css';

// The theme is on the page before anything is drawn, so a dark theme never flashes light.
watchLook();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
