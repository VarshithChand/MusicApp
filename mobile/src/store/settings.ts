import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ThemeMode } from '../theme/theme';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type LookChoice = 'default' | 'glass' | 'neo';
export type FontChoice = 'system' | 'serif' | 'mono' | 'condensed' | 'light';
export type TextSize = 'small' | 'normal' | 'large';

// Android system font families. 'system' keeps the default font.
export const FONT_FAMILIES: Record<FontChoice, string | undefined> = {
  system: undefined,
  serif: 'serif',
  mono: 'monospace',
  condensed: 'sans-serif-condensed',
  light: 'sans-serif-light',
};

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, normal: 1, large: 1.15 };

interface SettingsState {
  look: LookChoice;
  mode: ThemeChoice;
  font: FontChoice;
  textSize: TextSize;
  /** Volume boost in percent: 100 is normal, 200 is the loudest. */
  boost: number;
  update: (patch: Partial<Pick<SettingsState, 'look' | 'mode' | 'font' | 'textSize' | 'boost'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      look: 'default',
      mode: 'system',
      font: 'system',
      textSize: 'normal',
      boost: 100,
      update: (patch) => set(patch),
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const fixes: Partial<SettingsState> = {};
        if (!['default', 'glass', 'neo'].includes(state.look)) fixes.look = 'default';
        if (!['system', 'light', 'dark'].includes(state.mode)) fixes.mode = 'system';
        if (Object.keys(fixes).length) useSettings.setState(fixes);
      },
    },
  ),
);

/** The palette actually shown: a fixed look wins, otherwise the theme choice (system follows the phone). */
export function useResolvedMode(): ThemeMode {
  const look = useSettings((s) => s.look);
  const choice = useSettings((s) => s.mode);
  const scheme = useColorScheme();
  const light = choice === 'system' ? scheme === 'light' : choice === 'light';
  if (look === 'glass') return light ? 'glass-light' : 'glass-dark';
  if (look === 'neo') return light ? 'neo-light' : 'neo-dark';
  return light ? 'light' : 'dark';
}
