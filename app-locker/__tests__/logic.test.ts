import { filterApps } from '../src/utils/filterApps';
import { brandTips, protectionReady, summarize } from '../src/utils/permissions';
import { formatWait } from '../src/utils/format';
import { InstalledApp, PermissionStatus } from '../src/types';

const app = (label: string, packageName: string, isSystem = false): InstalledApp => ({
  label,
  packageName,
  isSystem,
  iconUri: null,
});

const apps = [
  app('WhatsApp', 'com.whatsapp'),
  app('Instagram', 'com.instagram.android'),
  app('Chrome', 'com.android.chrome'),
  app('Gallery', 'com.sec.android.gallery3d', true),
];

describe('filterApps', () => {
  it('matches by name or package, ignoring case and spaces', () => {
    expect(filterApps(apps, '  whats ', new Set()).map((a) => a.label)).toEqual(['WhatsApp']);
    expect(filterApps(apps, 'INSTAGRAM.android', new Set()).map((a) => a.label)).toEqual(['Instagram']);
  });

  it('returns nothing for an unknown search', () => {
    expect(filterApps(apps, 'zzz', new Set())).toEqual([]);
  });

  it('hides system apps unless asked, but keeps a locked system app visible', () => {
    expect(filterApps(apps, '', new Set()).map((a) => a.label)).not.toContain('Gallery');
    expect(filterApps(apps, '', new Set(), 'all', true).map((a) => a.label)).toContain('Gallery');
    expect(filterApps(apps, '', new Set(['com.sec.android.gallery3d'])).map((a) => a.label)).toContain('Gallery');
  });

  it('filters locked and unlocked', () => {
    const locked = new Set(['com.whatsapp']);
    expect(filterApps(apps, '', locked, 'locked').map((a) => a.label)).toEqual(['WhatsApp']);
    expect(filterApps(apps, '', locked, 'unlocked').map((a) => a.label)).toEqual(['Instagram', 'Chrome']);
  });
});

const status = (over: Partial<PermissionStatus> = {}): PermissionStatus => ({
  accessibility: true,
  overlay: true,
  biometric: 'available',
  usageAccess: false,
  batteryUnrestricted: false,
  manufacturer: 'samsung',
  sdkInt: 34,
  ...over,
});

describe('permissions summary', () => {
  it('marks accessibility as required and missing when off', () => {
    const row = summarize(status({ accessibility: false })).find((r) => r.key === 'accessibility')!;
    expect(row.required).toBe(true);
    expect(row.state).toBe('missing');
  });

  it('only accessibility decides whether protection works', () => {
    expect(protectionReady(status())).toBe(true);
    expect(protectionReady(status({ overlay: false, batteryUnrestricted: false }))).toBe(true);
    expect(protectionReady(status({ accessibility: false }))).toBe(false);
    expect(protectionReady(null)).toBe(false);
  });

  it('explains missing biometrics instead of failing', () => {
    const row = summarize(status({ biometric: 'none_enrolled' })).find((r) => r.key === 'biometric')!;
    expect(row.state).toBe('warn');
    expect(row.detail).toMatch(/fingerprint/i);
  });

  it('gives brand specific tips and a generic fallback', () => {
    expect(brandTips('Xiaomi').join(' ')).toMatch(/pop-up/);
    expect(brandTips('Samsung').join(' ')).toMatch(/Sleeping/);
    expect(brandTips('Unknown').length).toBeGreaterThan(0);
  });
});

describe('formatWait', () => {
  it('formats and rounds up', () => {
    expect(formatWait(30_000)).toBe('0:30');
    expect(formatWait(90_000)).toBe('1:30');
    expect(formatWait(1)).toBe('0:01');
  });
});
