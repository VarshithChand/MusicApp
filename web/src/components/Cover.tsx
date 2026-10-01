import { mediaUrl } from "../api/http";

const PALETTE: [string, string][] = [
  ["#3B4A6B", "#556A96"],
  ["#6B3B4F", "#964F6D"],
  ["#2F5D50", "#41806F"],
  ["#7A5C2E", "#A87C3F"],
  ["#4B3B6B", "#6A5495"],
];

interface Props {
  id: number;
  uri?: string | null;
  size: number;
  /** Corner radius; defaults to a rounded square, pass size / 2 for a circle. */
  radius?: number;
}

/** Artwork if there is any, otherwise a stable placeholder in the app's cover palette. */
export function Cover({ id, uri, size, radius = Math.round(size * 0.2) }: Props) {
  const [base, highlight] = PALETTE[Math.abs(id) % PALETTE.length];
  const src = mediaUrl(uri);
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 } as const;
  if (src) return <img src={src} alt="" style={{ ...box, objectFit: "cover" }} />;
  return (
    <div style={{ ...box, background: base, position: "relative", overflow: "hidden" }} aria-hidden="true">
      <div
        style={{
          position: "absolute",
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: "50%",
          background: highlight,
          right: -size * 0.16,
          bottom: -size * 0.16,
        }}
      />
    </div>
  );
}
