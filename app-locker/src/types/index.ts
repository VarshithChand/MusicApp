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

export interface Settings {
  pinConfigured: boolean;
  biometricEnabled: boolean;
  lockMode: LockMode;
  graceMinutes: number;
  pinLength: number;
}

export type BiometricStatus = 'available' | 'none_enrolled' | 'no_hardware' | 'unavailable' | 'unsupported';

export interface PermissionStatus {
  accessibility: boolean;
  overlay: boolean;
  biometric: BiometricStatus;
  usageAccess: boolean;
  batteryUnrestricted: boolean;
  manufacturer: string;
  sdkInt: number;
}

export type SettingsPage = 'accessibility' | 'overlay' | 'usage' | 'battery' | 'appInfo' | 'oem';

export interface PinResult {
  ok: boolean;
  remainingMs: number;
  failed?: number;
}

export interface AppInfo {
  versionName: string;
  versionCode: number;
}
