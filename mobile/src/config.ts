// Debug builds talk to the backend on your computer (10.0.2.2 is the Android emulator's alias for it).
// For a physical phone in dev, use your computer's LAN IP. Release APKs need the deployed HTTPS URL.
export const API_URL = __DEV__ ? 'http://10.0.2.2:4000' : 'https://your-api.onrender.com';
