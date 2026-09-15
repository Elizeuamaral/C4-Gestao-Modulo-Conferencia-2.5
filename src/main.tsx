import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('./sw.js?v=20260826-2', window.location.href);
    navigator.serviceWorker
      .register(swUrl.href, { updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {
          console.warn('Falha ao atualizar service worker.');
        });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Falha ao registrar service worker:', error);
      });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
