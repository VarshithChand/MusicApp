import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AddToPlaylistSheet } from './src/components/AddToPlaylistSheet';
import { AppNavigator } from './src/navigation/AppNavigator';
import { setupPlayer } from './src/player/controls';
import { useAuth } from './src/store/auth';
import { colors } from './src/theme/theme';

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, primary: colors.accent, border: colors.surface2 },
};

export default function App() {
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }), []);
  const signedIn = useAuth((s) => !!s.accessToken);

  useEffect(() => {
    setupPlayer();
  }, []);

  // Don't show one account's playlists/likes to the next person who logs in.
  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn, queryClient]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar barStyle="light-content" />
        <NavigationContainer theme={navTheme}>
          <AppNavigator />
          {signedIn && <AddToPlaylistSheet />}
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
