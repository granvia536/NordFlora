import {Capacitor} from '@capacitor/core';
import {registerSW} from 'virtual:pwa-register';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

async function bootstrap() {
  if (Capacitor.isNativePlatform()) {
    // Remove any service worker left by an older APK before React starts.
    // A controlled first page must be reloaded after unregistering so that
    // Capacitor can inject its native bridge on the next document load.
    if ('serviceWorker' in navigator) {
      const wasControlled = navigator.serviceWorker.controller !== null;
      const registrations = await navigator.serviceWorker.getRegistrations();

      if (registrations.length > 0 || wasControlled) {
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        }

        if (wasControlled) {
          window.location.reload();
          return;
        }
      }
    }
  } else {
    registerSW({immediate: true});
  }

  createRoot(document.getElementById('root')!).render(<App />);
}

void bootstrap();
