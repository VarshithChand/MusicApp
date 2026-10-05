import { PermissionStatus } from '../types';

export type RowState = 'ok' | 'warn' | 'missing';

export interface PermissionRowInfo {
  key: 'accessibility' | 'overlay' | 'biometric' | 'battery' | 'usage';
  title: string;
  state: RowState;
  required: boolean;
  detail: string;
}

/** Turns the raw Android status into the rows shown on the Permissions & Protection screen. */
export function summarize(s: PermissionStatus): PermissionRowInfo[] {
  return [
    {
      key: 'accessibility',
      title: 'Accessibility Service',
      state: s.accessibility ? 'ok' : 'missing',
      required: true,
      detail: s.accessibility
        ? 'Enabled. App Locker can tell which app is open.'
        : 'Required. Without it no app can be locked.',
    },
    {
      key: 'overlay',
      title: 'Display over other apps',
      state: s.overlay ? 'ok' : 'warn',
      required: false,
      detail: s.overlay
        ? 'Enabled. The lock screen can open reliably from the background.'
        : 'Recommended. Helps the lock screen appear on time on some phones.',
    },
    {
      key: 'biometric',
      title: 'Fingerprint / biometric',
      state: s.biometric === 'available' ? 'ok' : 'warn',
      required: false,
      detail: biometricDetail(s.biometric),
    },
    {
      key: 'battery',
      title: 'Battery optimisation',
      state: s.batteryUnrestricted ? 'ok' : 'warn',
      required: false,
      detail: s.batteryUnrestricted
        ? 'Unrestricted. Android is less likely to stop App Locker.'
        : 'Action recommended. Android may stop App Locker in the background.',
    },
    {
      key: 'usage',
      title: 'Usage access',
      state: s.usageAccess ? 'ok' : 'warn',
      required: false,
      detail: s.usageAccess ? 'Enabled.' : 'Optional. Not needed for normal use.',
    },
  ];
}

function biometricDetail(b: PermissionStatus['biometric']): string {
  switch (b) {
    case 'available':
      return 'Ready. Fingerprint or strong face unlock can be used.';
    case 'none_enrolled':
      return 'No fingerprint is set up in Android. Add one in Android Settings, or use the PIN.';
    case 'no_hardware':
      return 'This phone has no biometric sensor. The PIN is used.';
    case 'unavailable':
      return 'The sensor is not available right now. The PIN is used.';
    default:
      return 'Not supported on this phone. The PIN is used.';
  }
}

/** Locks only work when the required permission is on. */
export function protectionReady(s: PermissionStatus | null): boolean {
  return !!s && s.accessibility;
}

/** Brand-specific steps, because phone makers add their own background limits. */
export function brandTips(manufacturer: string): string[] {
  const m = manufacturer.toLowerCase();
  if (['xiaomi', 'redmi', 'poco'].includes(m)) {
    return [
      'Enable Autostart for App Locker.',
      'In App info > Other permissions, allow "Display pop-up windows while running in the background".',
      'Set Battery saver to "No restrictions".',
      'Lock App Locker in the Recents screen.',
    ];
  }
  if (['oppo', 'realme'].includes(m)) {
    return [
      'Allow auto-launch / startup for App Locker.',
      'Allow background activity in the battery settings.',
      'Do not let Android freeze App Locker in the background.',
    ];
  }
  if (m === 'vivo' || m === 'iqoo') {
    return ['Allow background start for App Locker.', 'Set background power use to "High".'];
  }
  if (m === 'oneplus') {
    return ["Set battery optimisation for App Locker to \"Don't optimise\".", 'Allow background activity.'];
  }
  if (m === 'samsung') {
    return [
      'Remove App Locker from "Sleeping apps" and "Deep sleeping apps".',
      'Set its battery usage to "Unrestricted".',
    ];
  }
  return ['If the lock stops working after a while, set battery usage for App Locker to Unrestricted.'];
}
