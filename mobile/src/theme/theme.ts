export const colors = {
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
};

// Placeholder cover colours (base, highlight), picked per item id when there is no artwork.
export const coverPalette: [string, string][] = [
  ['#3B4A6B', '#556A96'],
  ['#6B3B4F', '#964F6D'],
  ['#2F5D50', '#41806F'],
  ['#7A5C2E', '#A87C3F'],
  ['#4B3B6B', '#6A5495'],
];

export const fonts = {
  // Design uses Bricolage Grotesque (headings) and DM Sans (body). Until the font files are bundled
  // in android/app/src/main/assets/fonts, the system font is used.
  heading: undefined as string | undefined,
  body: undefined as string | undefined,
};
