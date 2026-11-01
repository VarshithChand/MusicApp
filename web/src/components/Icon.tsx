const ICONS = {
  home: { d: ["M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"] },
  search: { d: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-4.5-4.5"] },
  history: { d: ["M12 8v4l3 3", "M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"] },
  library: { d: ["M4 4v16M9 4v16M14 6l5 14"] },
  user: { d: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M4 21a8 8 0 0 1 16 0"] },
  play: { solid: true, d: ["M8 4.5l12 7.5-12 7.5z"] },
  pause: { solid: true, d: ["M7 5h3v14H7z", "M14 5h3v14h-3z"] },
  next: { solid: true, d: ["M6 5l10 7-10 7z", "M19 5v14"] },
  prev: { solid: true, d: ["M18 5L8 12l10 7z", "M5 5v14"] },
  shuffle: { d: ["M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"] },
  repeat: { d: ["M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"] },
  heart: { d: ["M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"] },
  plus: { d: ["M12 5v14M5 12h14"] },
  chevronDown: { d: ["M6 9l6 6 6-6"] },
  back: { d: ["M15 6l-6 6 6 6"] },
  volume: { d: ["M4 9v6h4l5 4V5L8 9z"] },
  trash: { d: ["M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"] },
  edit: { d: ["M4 20h4L19 9l-4-4L4 16z"] },
  eye: { d: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"] },
  eyeOff: {
    d: [
      "M3 3l18 18",
      "M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9",
      "M6.6 7.6A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 4-.9",
      "M9.9 9.9a3 3 0 0 0 4.2 4.2",
    ],
  },
  download: { d: ["M12 4v11M7 11l5 5 5-5M5 20h14"] },
  logout: { d: ["M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"] },
  youtube: {
    d: [
      "M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29.94 29.94 0 0 0 1 12a29.94 29.94 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96c1.71.46 8.59.46 8.59.46s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29.94 29.94 0 0 0 23 12a29.94 29.94 0 0 0-.46-5.58z",
      "M9.75 15.02l5.75-3.27-5.75-3.27v6.54z",
    ],
  },
  settings: {
    d: [
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    ],
  },
  close: { d: ["M18 6L6 18", "M6 6l12 12"] },
  check: { d: ["M20 6L9 17l-5-5"] },
  external: { d: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"] },
  shield: { d: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"] },
  sparkles: { d: ["M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1"] },
  sliders: { d: ["M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"] },
  male: { d: ["M10 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M19 5l-5.4 5.4", "M14 5h5v5"] },
  female: { d: ["M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 14v7", "M9 18h6"] },
  popup: {
    d: [
      "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z",
      "M12 11h7v7h-7z",
    ],
  },
  halfScreen: {
    d: [
      "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z",
      "M3 13h18",
    ],
  },
  fullScreen: {
    d: [
      "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
    ],
  },
  rewind: {
    solid: true,
    d: ["M11 5L2 12l9 7V5z", "M20 5l-9 7 9 7V5z"],
  },
  fastForward: {
    solid: true,
    d: ["M4 5l9 7-9 7V5z", "M13 5l9 7-9 7V5z"],
  },
  rotateCcw: {
    d: ["M1 4v6h6", "M3.51 15a9 9 0 1 0 2.13-9.36L1 10"],
  },
  rotateCw: {
    d: ["M23 4v6h-6", "M20.49 15a9 9 0 1 1-2.12-9.36L23 10"],
  },
} as const;

export type IconName = keyof typeof ICONS;

/** Inline stroke icon that takes its colour from the surrounding text colour. */
export function Icon({ name, size = 24, filled, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  const icon = ICONS[name] as { solid?: boolean; d: readonly string[] } | undefined;
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {icon.d.map((d) => (
        <path
          key={d}
          d={d}
          fill={icon.solid || filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
