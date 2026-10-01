const ICONS = {
  home: { d: ["M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"] },
  search: { d: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M21 21l-4.5-4.5"] },
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
  logout: { d: ["M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"] },
} as const;

export type IconName = keyof typeof ICONS;

/** Inline stroke icon that takes its colour from the surrounding text colour. */
export function Icon({ name, size = 24, filled }: { name: IconName; size?: number; filled?: boolean }) {
  const icon = ICONS[name] as { solid?: boolean; d: readonly string[] };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
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
