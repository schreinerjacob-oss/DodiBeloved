import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dodi.app',
  appName: 'dodi',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#F8F1E9',
    },
    StatusBar: {
      style: 'Light',
      backgroundColor: '#F8F1E9',
    },
  },
};

export default config;
