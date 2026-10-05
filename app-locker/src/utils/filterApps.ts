import { InstalledApp } from '../types';

export type LockFilter = 'all' | 'locked' | 'unlocked';

/**
 * Search and filter the installed-app list. Matches the app name or the package name, ignoring case and extra spaces.
 * Every launchable app is listed by default, because Chrome, YouTube, Gallery and Phone are "system" apps on many phones.
 * The user can hide system apps to shorten the list; even then an app that is already locked stays visible (so it can be
 * turned off) and a search still looks at every app.
 */
export function filterApps(
  apps: InstalledApp[],
  query: string,
  lockedPackages: ReadonlySet<string>,
  filter: LockFilter = 'all',
  hideSystem = false,
): InstalledApp[] {
  const q = query.trim().toLowerCase();
  return apps.filter((a) => {
    const locked = lockedPackages.has(a.packageName);
    if (a.isSystem && hideSystem && !locked && !q) {
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
