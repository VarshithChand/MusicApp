/** 90000 -> "1:30". Rounds up so the display never shows 0:00 while still locked. */
export function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
