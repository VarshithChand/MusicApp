import { InstalledApp } from '../types';

export type LockFilter = 'all' | 'locked' | 'unlocked';

/**
 * Search and filter the installed-app list. Matches the app name or the package name, ignoring case and extra spaces.
 * System apps are hidden unless asked for, but an app that is already locked is always shown so it can be turned off.
 */
export function filterApps(
  apps: InstalledApp[],
  query: string,
  lockedPackages: ReadonlySet<string>,
  filter: LockFilter = 'all',
  showSystem = false,
): InstalledApp[] {
  const q = query.trim().toLowerCase();
  return apps.filter((a) => {
    const locked = lockedPackages.has(a.packageName);
    if (a.isSystem && !showSystem && !locked) {
      return false;
    }
    if (filter === 'locked' && !locked) {
      return false;
    }
    if (filter === 'unlocked' && locked) {
      return false;
    }
    if (!q) {
      return true;
    }
    return a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q);
  });
}
