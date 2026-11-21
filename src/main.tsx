import {Capacitor} from '@capacitor/core';
import {registerSW} from 'virtual:pwa-register';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Keep the PWA service worker on normal web browsers only.
// On Android/iOS, service workers can interfere with Capacitor's native plugin bridge.
if (Capacitor.isNativePlatform()) {
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        void registration.unregister();
      });
    });
  }
} else {
  registerSW({immediate: true});
}

createRoot(document.getElementById('root')!).render(<App />);
