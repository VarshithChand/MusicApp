import React from 'react';
import Svg, { Path } from 'react-native-svg';

const ICONS = {
  home: { d: ['M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  search: { d: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.5-4.5'] },
  library: { d: ['M4 4v16M9 4v16M14 6l5 14'] },
  user: { d: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'] },
  more: {
    solid: true,
    d: [
      'M5 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
      'M12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
      'M19 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
    ],
  },
  play: { solid: true, d: ['M8 4.5l12 7.5-12 7.5z'] },
  pause: { solid: true, d: ['M7 5h3v14H7z', 'M14 5h3v14h-3z'] },
  next: { solid: true, d: ['M6 5l10 7-10 7z', 'M19 5v14'] },
  prev: { solid: true, d: ['M18 5L8 12l10 7z', 'M5 5v14'] },
  shuffle: { d: ['M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3'] },
  repeat: { d: ['M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3'] },
  heart: { d: ['M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z'] },
  plus: { d: ['M12 5v14M5 12h14'] },
  chevronDown: { d: ['M6 9l6 6 6-6'] },
  back: { d: ['M15 6l-6 6 6 6'] },
  volume: { d: ['M4 9v6h4l5 4V5L8 9z'] },
  queue: { d: ['M4 6h12M4 12h12M4 18h7M18 15v6l4-3z'] },
  trash: { d: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'] },
  edit: { d: ['M4 20h4L19 9l-4-4L4 16z'] },
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  color: string;
  /** Fills the shape (e.g. a liked heart). */
  filled?: boolean;
}

export function Icon({ name, size = 24, color, filled }: Props) {
  const icon = ICONS[name] as { solid?: boolean; d: readonly string[] };
  const fill = icon.solid || filled ? color : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icon.d.map((d) => (
        <Path
          key={d}
          d={d}
          fill={fill}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
