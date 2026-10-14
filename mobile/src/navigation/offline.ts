import { createNavigationContainerRef } from '@react-navigation/native';

// Routes are untyped across this app (screens use useNavigation<any>()), so the ref matches.
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Sends the listener to their own music when the phone loses the server.
 *
 * Everything else in the app needs the network, so leaving them on an empty Home with a row of
 * errors is no use: the files already on the phone are the one thing that still plays. It only
 * moves them once per disconnection, so it can't fight them for the screen while they're offline.
 */
export function goToLocalMedia(): void {
  if (!navigationRef.isReady()) return;
  const route = navigationRef.getCurrentRoute()?.name;
  if (route === 'LocalMedia' || route === 'Login' || route === 'NowPlaying') return;
  navigationRef.navigate('Tabs', { screen: 'LocalMedia' });
}
