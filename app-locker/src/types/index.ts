export interface InstalledApp {
  packageName: string;
  label: string;
  isSystem: boolean;
  iconUri: string | null;
}

export interface ProtectedApp {
  packageName: string;
  displayName: string;
  enabled: boolean;
  addedAt: number;
}

export type LockMode = 'IMMEDIATE' | 'AFTER_SCREEN_LOCK' | 'TIMED';

export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';

export interface Settings {
  pinConfigured: boolean;
  biometricEnabled: boolean;
  lockMode: LockMode;
  graceMinutes: number;
  pinLength: number;
  themeMode: ThemeMode;
  /** Replace the text of notifications from locked apps with "Unlock to read it". */
  hideNotifications: boolean;
}

export type BiometricStatus = 'available' | 'none_enrolled' | 'no_hardware' | 'unavailable' | 'unsupported';

export interface PermissionStatus {
  accessibility: boolean;
  overlay: boolean;
  biometric: BiometricStatus;
  usageAccess: boolean;
  /** Notification access (needed to hide the text of locked apps' notifications). */
  notificationAccess: boolean;
  /** Whether Android lets App Locker show its own notifications (needed for the "Unlock to read" replacement). */
  notificationsAllowed: boolean;
  batteryUnrestricted: boolean;
  manufacturer: string;
  sdkInt: number;
}

export type SettingsPage =
  | 'accessibility'
  | 'overlay'
  | 'usage'
  | 'battery'
  | 'appInfo'
  | 'oem'
  | 'notificationAccess'
  | 'postNotifications';

export interface PinResult {
  ok: boolean;
  remainingMs: number;
  failed?: number;
}

export interface AppInfo {
  versionName: string;
  versionCode: number;
}
