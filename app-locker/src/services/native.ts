import { DeviceEventEmitter, NativeModules } from 'react-native';
import {
  AppInfo,
  BiometricStatus,
  InstalledApp,
  PermissionStatus,
  PinResult,
  ProtectedApp,
  Settings,
  SettingsPage,
} from '../types';

/**
 * Typed access to the Kotlin modules. All detection, locking, PIN checking and the lock screen live in Kotlin;
 * JavaScript only shows the settings and asks the native side to change them.
 */
const { AppList, PermissionModule, BiometricModule, LockModule, SecuritySettings } = NativeModules;

function mod<T>(m: T | undefined, name: string): T {
  if (!m) {
    throw new Error(`Native module ${name} is missing. Rebuild the Android app.`);
  }
  return m;
}

export const appsApi = {
  getLaunchableApps: (): Promise<InstalledApp[]> => mod(AppList, 'AppList').getLaunchableApps(),
};

export const permissionsApi = {
  getStatus: (): Promise<PermissionStatus> => mod(PermissionModule, 'PermissionModule').getPermissionStatus(),
  open: (page: SettingsPage): Promise<boolean> => mod(PermissionModule, 'PermissionModule').openPermissionSettings(page),
  getAppInfo: (): Promise<AppInfo> => mod(PermissionModule, 'PermissionModule').getAppInfo(),
};

export const biometricApi = {
  status: (): Promise<BiometricStatus> => mod(BiometricModule, 'BiometricModule').isBiometricAvailable(),
  /** true = confirmed, false = user chose the PIN / cancelled. */
  authenticate: (reason: string): Promise<boolean> => mod(BiometricModule, 'BiometricModule').authenticate(reason),
};

export const lockApi = {
  getProtectedApps: (): Promise<ProtectedApp[]> => mod(LockModule, 'LockModule').getProtectedApps(),
  add: (packageName: string, displayName: string): Promise<boolean> =>
    mod(LockModule, 'LockModule').addProtectedApp(packageName, displayName),
  remove: (packageName: string): Promise<boolean> => mod(LockModule, 'LockModule').removeProtectedApp(packageName),
  isProtectionActive: (): Promise<boolean> => mod(LockModule, 'LockModule').isProtectionActive(),
};

export const securityApi = {
  getSettings: (): Promise<Settings> => mod(SecuritySettings, 'SecuritySettings').getSettings(),
  updateSettings: (
    patch: Partial<Pick<Settings, 'biometricEnabled' | 'lockMode' | 'graceMinutes'>>,
  ): Promise<boolean> => mod(SecuritySettings, 'SecuritySettings').updateSettings(patch),
  isTrivialPin: (pin: string): Promise<boolean> => mod(SecuritySettings, 'SecuritySettings').isTrivialPin(pin),
  setPin: (pin: string): Promise<boolean> => mod(SecuritySettings, 'SecuritySettings').setPin(pin),
  changePin: (oldPin: string, newPin: string): Promise<PinResult> =>
    mod(SecuritySettings, 'SecuritySettings').changePin(oldPin, newPin),
  verifyPin: (pin: string): Promise<PinResult> => mod(SecuritySettings, 'SecuritySettings').verifyPin(pin),
  getLockoutRemaining: (): Promise<number> => mod(SecuritySettings, 'SecuritySettings').getLockoutRemaining(),
};

/** Events sent by the native side: protectionChanged, lockStateChanged, appsChanged. Returns an unsubscribe function. */
export function onNativeEvent(name: string, cb: (payload?: string) => void): () => void {
  const sub = DeviceEventEmitter.addListener(name, cb);
  return () => sub.remove();
}
