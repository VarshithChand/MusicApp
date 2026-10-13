import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

export type ThemeMode = 'dark' | 'light' | 'glass-dark' | 'glass-light' | 'neo-dark' | 'neo-light';

type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  track: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  danger: string;
};

const palettes: Record<ThemeMode, Palette> = {
  dark: {
    bg: '#0E1014',
    surface: '#171A21',
    surface2: '#20242D',
    border: '#2A2F3A',
    track: '#2F3440',
    text: '#F4F5F7',
    muted: '#A3A9B5',
    accent: '#FFC53D',
    onAccent: '#1A1400',
    danger: '#FF7A7A',
  },
  light: {
    bg: '#F6F7F9',
    surface: '#FFFFFF',
    surface2: '#ECEEF2',
    border: '#D9DDE5',
    track: '#D0D4DC',
    text: '#14171F',
    muted: '#5B6170',
    accent: '#E0A100',
    onAccent: '#1A1400',
    danger: '#D93B3B',
  },
  'glass-dark': {
    bg: '#070B1A',
    surface: 'rgba(30,41,66,0.6)',
    surface2: 'rgba(38,50,80,0.72)',
    border: 'rgba(255,255,255,0.1)',
    track: 'rgba(255,255,255,0.1)',
    text: '#E7ECF6',
    muted: '#A3B0CC',
    accent: '#60A5FA',
    onAccent: '#070B1A',
    danger: '#FF8A8A',
  },
  'glass-light': {
    bg: '#EEF2FF',
    surface: 'rgba(255,255,255,0.78)',
    surface2: 'rgba(255,255,255,0.88)',
    border: 'rgba(148,163,184,0.35)',
    track: 'rgba(148,163,184,0.35)',
    text: '#0F172A',
    muted: '#64748B',
    accent: '#3B82F6',
    onAccent: '#FFFFFF',
    danger: '#D93B3B',
  },
  'neo-dark': {
    bg: '#1A1A1A',
    surface: '#242424',
    surface2: '#2A2A2A',
    border: '#F4F1E9',
    track: '#3A3A3A',
    text: '#F4F1E9',
    muted: '#AAAAAA',
    accent: '#6D97FF',
    onAccent: '#1A1A1A',
    danger: '#FF7A7A',
  },
  'neo-light': {
    bg: '#F4F1E9',
    surface: '#FFFFFF',
    surface2: '#FAF8F2',
    border: '#111111',
    track: '#D6D2C8',
    text: '#111111',
    muted: '#444444',
    accent: '#2F6BFF',
    onAccent: '#FFFFFF',
    danger: '#D93B3B',
  },
};

/** The colours every screen reads. applyTheme() swaps them in place, then bumps the version so styles recompute. */
export const colors: Palette = { ...palettes.dark };

let version = 0;
export const getThemeVersion = () => version;

export function applyTheme(mode: ThemeMode) {
  Object.assign(colors, palettes[mode] ?? palettes.dark);
  version += 1;
}

type AnyStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * Like StyleSheet.create, but the styles are rebuilt whenever the theme changes. Each style is read through a
 * proxy, so screens that already hold a reference keep working after the theme is switched.
 */
export function themedStyles<T extends Record<string, AnyStyle>>(factory: () => T): T {
  let cache: T | null = null;
  let cacheVersion = -1;
  const current = () => {
    if (!cache || cacheVersion !== version) {
      cache = factory();
      cacheVersion = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_, key: string) => current()[key as keyof T],
  });
}

// Placeholder cover colours (base, highlight), picked per item id when there is no artwork.
export const coverPalette: [string, string][] = [
  ['#3B4A6B', '#556A96'],
  ['#6B3B4F', '#964F6D'],
  ['#2F5D50', '#41806F'],
  ['#7A5C2E', '#A87C3F'],
  ['#4B3B6B', '#6A5495'],
];
