import { useColorScheme } from 'react-native';

export interface Colors {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  border: string;
  track: string;
  ok: string;
  warn: string;
  danger: string;
}

const dark: Colors = {
  dark: true,
  bg: '#0C0E11',
  card: '#171A1F',
  text: '#F1F3F5',
  muted: '#9AA3AE',
  accent: '#2DD4BF',
  onAccent: '#04201C',
  border: '#272B33',
  track: '#262B33',
  ok: '#4ADE80',
  warn: '#FBBF24',
  danger: '#F87171',
};

const light: Colors = {
  dark: false,
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#12161B',
  muted: '#5B6673',
  accent: '#0F766E',
  onAccent: '#FFFFFF',
  border: '#DCE1E7',
  track: '#E3E8EE',
  ok: '#15803D',
  warn: '#A16207',
  danger: '#B91C1C',
};

/** Follows the phone's light/dark setting. */
export function useColors(): Colors {
  return useColorScheme() === 'light' ? light : dark;
}
