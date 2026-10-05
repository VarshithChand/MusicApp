import { create } from 'zustand';
import { appsApi, lockApi, permissionsApi, securityApi } from '../services/native';
import { InstalledApp, PermissionStatus, ProtectedApp, Settings } from '../types';

interface AppState {
  apps: InstalledApp[];
  appsLoading: boolean;
  appsError: string | null;
  protectedApps: ProtectedApp[];
  settings: Settings | null;
  permissions: PermissionStatus | null;
  /** The locker's own gate: its screens need the PIN/fingerprint once a PIN exists. */
  unlocked: boolean;

  loadApps: () => Promise<void>;
  loadProtected: () => Promise<void>;
  loadSettings: () => Promise<void>;
  loadPermissions: () => Promise<void>;
  refreshAll: () => Promise<void>;
  /** Returns 'needs-pin' when no PIN exists yet, so the screen can start the setup. */
  setLocked: (app: InstalledApp, on: boolean) => Promise<'ok' | 'needs-pin'>;
  setUnlocked: (v: boolean) => void;
}

export const useApp = create<AppState>((set, get) => ({
  apps: [],
  appsLoading: false,
  appsError: null,
  protectedApps: [],
  settings: null,
  permissions: null,
  unlocked: false,

  loadApps: async () => {
    set({ appsLoading: true, appsError: null });
    try {
      set({ apps: await appsApi.getLaunchableApps(), appsLoading: false });
    } catch (e) {
      set({ appsLoading: false, appsError: e instanceof Error ? e.message : 'Could not list apps' });
    }
  },
  loadProtected: async () => set({ protectedApps: await lockApi.getProtectedApps() }),
  loadSettings: async () => set({ settings: await securityApi.getSettings() }),
  loadPermissions: async () => set({ permissions: await permissionsApi.getStatus() }),
  refreshAll: async () => {
    await Promise.all([get().loadProtected(), get().loadSettings(), get().loadPermissions()]);
  },

  setLocked: async (app, on) => {
    if (on) {
      if (!get().settings?.pinConfigured) {
        return 'needs-pin';
      }
      await lockApi.add(app.packageName, app.label);
    } else {
      await lockApi.remove(app.packageName);
    }
    await get().loadProtected();
    return 'ok';
  },
  setUnlocked: (v) => set({ unlocked: v }),
}));
