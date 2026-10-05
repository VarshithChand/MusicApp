import React, { useEffect, useRef } from 'react';
import { AppState, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useApp } from './src/store/useApp';

/** The locker's own gate comes back if the app was in the background for longer than this. */
const RELOCK_AFTER_MS = 60_000;

export default function App() {
  const loadSettings = useApp((s) => s.loadSettings);
  const refreshAll = useApp((s) => s.refreshAll);
  const setUnlocked = useApp((s) => s.setUnlocked);
  const leftAt = useRef<number | null>(null);

  useEffect(() => {
    refreshAll().catch(() => loadSettings().catch(() => {}));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt.current = Date.now();
      } else if (state === 'active') {
        // A short trip to Android Settings (to enable a permission) must not ask for the PIN again.
        if (leftAt.current && Date.now() - leftAt.current > RELOCK_AFTER_MS) {
          setUnlocked(false);
        }
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [loadSettings, refreshAll, setUnlocked]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
