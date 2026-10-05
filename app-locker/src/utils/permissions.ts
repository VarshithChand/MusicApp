import { PermissionStatus, SettingsPage } from '../types';

export type RowState = 'ok' | 'warn' | 'missing';

export interface PermissionAction {
  label: string;
  page: SettingsPage;
}

export interface PermissionRowInfo {
  key: 'accessibility' | 'overlay' | 'biometric' | 'notifications' | 'battery' | 'usage';
  title: string;
  state: RowState;
  required: boolean;
  detail: string;
  /** The button to show while the row is not fully OK (opens the matching Android settings page). */
  action: PermissionAction | null;
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
      action: { label: 'Open Accessibility settings', page: 'accessibility' },
    },
    {
      key: 'overlay',
      title: 'Display over other apps',
      state: s.overlay ? 'ok' : 'warn',
      required: false,
      detail: s.overlay
        ? 'Enabled. The lock screen can open reliably from the background.'
        : 'Recommended. Helps the lock screen appear on time on some phones.',
      action: { label: 'Allow display over other apps', page: 'overlay' },
    },
    {
      key: 'biometric',
      title: 'Fingerprint / biometric',
      state: s.biometric === 'available' ? 'ok' : 'warn',
      required: false,
      detail: biometricDetail(s.biometric),
      action: null,
    },
    notificationsRow(s),
    {
      key: 'battery',
      title: 'Battery optimisation',
      state: s.batteryUnrestricted ? 'ok' : 'warn',
      required: false,
      detail: s.batteryUnrestricted
        ? 'Unrestricted. Android is less likely to stop App Locker.'
        : 'Action recommended. Android may stop App Locker in the background.',
      action: { label: 'Remove battery limits', page: 'battery' },
    },
    {
      key: 'usage',
      title: 'Usage access',
      state: s.usageAccess ? 'ok' : 'warn',
      required: false,
      detail: s.usageAccess ? 'Enabled.' : 'Optional. Not needed for normal use.',
      action: { label: 'Open usage access', page: 'usage' },
    },
  ];
}

/** Hiding the text of locked apps' notifications needs two things: notification access and permission to show our own. */
function notificationsRow(s: PermissionStatus): PermissionRowInfo {
  const base = { key: 'notifications' as const, title: 'Hide notification text', required: false };
  if (!s.notificationAccess) {
    return {
      ...base,
      state: 'warn',
      detail:
        'Optional. Lets App Locker replace the text of notifications from locked apps (like WhatsApp messages) with "Unlock to read it". It looks only at which app sent a notification, never at its text.',
      action: { label: 'Allow notification access', page: 'notificationAccess' },
    };
  }
  if (!s.notificationsAllowed) {
    return {
      ...base,
      state: 'warn',
      detail: 'Notification access is on, but Android is blocking App Locker\'s own notifications. Allow them so the "Unlock to read it" notice can appear.',
      action: { label: 'Allow App Locker notifications', page: 'postNotifications' },
    };
  }
  return {
    ...base,
    state: 'ok',
    detail: 'On. Text of notifications from locked apps is replaced with "Unlock to read it". Calls, alarms and music controls are never touched.',
    action: null,
  };
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
