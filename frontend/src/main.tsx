import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { App } from './App';
import './tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Keeps the dashboard's shell and bundle on the device so it opens with no connection. The data is
// kept per person by lib/offline.ts, not by the worker. Production only: in development the worker
// would keep Vite's own modules.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
