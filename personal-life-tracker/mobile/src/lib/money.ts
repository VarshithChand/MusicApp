/**
 * Money is stored as whole minor units (paise) so there are no floating-point errors: Rs 123.45 = 12345.
 */

/** Parses what the user typed ("120", "120.5", "1,200.75") into paise. Returns null if it is not a valid positive amount. */
export function parseAmountToMinor(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [whole, frac = ''] = cleaned.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    return null;
  }
  return minor;
}

/** Indian digit grouping: 1234567 -> "12,34,567". */
function groupIndian(n: string): string {
  if (n.length <= 3) {
    return n;
  }
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** 12345 -> "₹123.45", 12300 -> "₹123", -500 -> "-₹5". */
export function formatInr(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  const body = groupIndian(String(rupees)) + (paise ? `.${String(paise).padStart(2, '0')}` : '');
  return `${neg ? '-' : ''}₹${body}`;
}
