import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useApp } from './store/useApp';

export interface Colors {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  accent: string;
  /** Text on top of the accent colour (buttons, selected chips). */
  onAccent: string;
  ok: string;
  warn: string;
  danger: string;
  border: string;
}

/** Same values as the native lock screen (LockPalette.kt) so the app looks the same everywhere. */
export const darkColors: Colors = {
  dark: true,
  bg: '#0B0B0D',
  surface: '#17181C',
  surface2: '#22242A',
  text: '#F2F3F5',
  muted: '#9AA0AA',
  accent: '#4C8DFF',
  onAccent: '#FFFFFF',
  ok: '#3DDC84',
  warn: '#FFB74D',
  danger: '#FF6B6B',
  border: '#2B2E36',
};

export const lightColors: Colors = {
  dark: false,
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surface2: '#E6E9EF',
  text: '#14161A',
  muted: '#5D6573',
  accent: '#2563EB',
  onAccent: '#FFFFFF',
  ok: '#0F7B4F',
  warn: '#9A6200',
  danger: '#C62828',
  border: '#D9DDE5',
};

export const radius = { sm: 10, md: 16, lg: 24 };

/** The colours to use right now: the theme chosen in Security (System, Light or Dark), following the phone for System. */
export function useColors(): Colors {
  const mode = useApp((s) => s.settings?.themeMode ?? 'SYSTEM');
  const system = useColorScheme();
  const dark = mode === 'DARK' || (mode === 'SYSTEM' && system !== 'light');
  return dark ? darkColors : lightColors;
}

/** Builds a screen's styles for the current colours (cached until the theme changes). */
export function useStyles<T>(make: (c: Colors) => T): T {
  const colors = useColors();
  return useMemo(() => make(colors), [make, colors]);
}
