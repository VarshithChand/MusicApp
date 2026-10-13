import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AddToPlaylistSheet } from './src/components/AddToPlaylistSheet';
import { SplashAnimation } from './src/components/SplashAnimation';
import { YouTubeFloatingPlayer } from './src/components/YouTubeFloatingPlayer';
import { AppNavigator } from './src/navigation/AppNavigator';
import { setupPlayer } from './src/player/controls';
import { useAuth } from './src/store/auth';
import { setAppIconVariant } from './src/native/appIcon';
import { setVolumeBoost } from './src/native/volumeBoost';
import { useResolvedMode, useSettings } from './src/store/settings';
import { useYouTubePlayer } from './src/store/youtubePlayer';
import { applyTheme, colors, ThemeMode } from './src/theme/theme';

export default function App() {
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }), []);
  const signedIn = useAuth((s) => !!s.accessToken);
  // Keying the navigator by the resolved theme rebuilds the screens so every style re-reads the new colours.
  const resolved = useResolvedMode();
  const appliedMode = useRef<ThemeMode | null>(null);
  if (appliedMode.current !== resolved) {
    applyTheme(resolved);
    appliedMode.current = resolved;
  }
  const isLight = resolved.endsWith('light');
  const boost = useSettings((s) => s.boost);
  useEffect(() => {
    setVolumeBoost(boost);
  }, [boost]);
  const iconVariant = useRef<'dark' | 'light'>('dark');
  useEffect(() => {
    iconVariant.current = resolved === 'dark' ? 'dark' : 'light';
  }, [resolved]);

  // Switching the launcher icon closes the app's own screen, so it only changes once the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setAppIconVariant(iconVariant.current);
    });
    return () => sub.remove();
  }, [resolved]);
  const navTheme = useMemo(
    () => ({
      ...(isLight ? DefaultTheme : DarkTheme),
      colors: {
        ...(isLight ? DefaultTheme : DarkTheme).colors,
        background: colors.bg,
        card: colors.bg,
        primary: colors.accent,
        border: colors.surface2,
      },
    }),
    [isLight],
  );
  const [splashing, setSplashing] = useState(true);

  useEffect(() => {
    setupPlayer();
  }, []);

  // Don't show one account's playlists/likes (or a still-playing video) to the next person who logs in.
  useEffect(() => {
    if (!signedIn) {
      queryClient.clear();
      useYouTubePlayer.getState().close();
    }
  }, [signedIn, queryClient]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
        <NavigationContainer theme={navTheme}>
          <AppNavigator key={resolved} />
          {signedIn && <AddToPlaylistSheet />}
          {signedIn && <YouTubeFloatingPlayer />}
        </NavigationContainer>
        {splashing && <SplashAnimation onDone={() => setSplashing(false)} />}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
