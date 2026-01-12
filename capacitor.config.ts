import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sendanything.app',
  appName: 'Send Anything',
  webDir: 'dist',
  server: {
    // Allow loading from the web when online for updates
    url: 'https://send-anything.web.app',
    cleartext: true,
    // But work offline by default
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    // Enable offline mode - app works without internet
    webContentsDebuggingEnabled: true
  }
};

export default config;
