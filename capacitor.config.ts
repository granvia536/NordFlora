import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nordflora.app',
  appName: 'NordFlora',
  webDir: 'dist',
  // Use a fresh native WebView origin so any service worker left by earlier
  // APK builds on https://localhost cannot intercept the Capacitor bridge.
  server: {
    hostname: 'nordflora.local',
    androidScheme: 'https',
  },
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
      skipNativeAuth: true,
    },
  },
};

export default config;
