import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CitizenApp } from './CitizenApp';
import './citizen.css';

declare global {
  interface Window {
    /** Read by the watchdog in citizen.html: set means the bundle arrived and there is no need to fall back. */
    __vukaBooted?: boolean;
  }
}

window.__vukaBooted = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CitizenApp />
  </StrictMode>,
);

// Keeps every page and figure read here on the device. Production only: in development the Vite
// server's own modules would be the ones kept.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
