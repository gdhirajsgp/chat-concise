import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.e0e5a38892ea447f981a9e3c1daddd04',
  appName: 'MeetingMind',
  webDir: 'dist',
  server: {
    url: 'https://e0e5a388-92ea-447f-981a-9e3c1daddd04.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#0A0F1C'
  },
  android: {
    backgroundColor: '#0A0F1C'
  }
};

export default config;
