import { NativeEventEmitter, NativeModules } from 'react-native';

interface AppUpdateNative {
  currentVersion(): Promise<string>;
  download(url: string): Promise<string>;
  install(fileUri: string): Promise<boolean>;
}

const native = () => NativeModules.AppUpdate as AppUpdateNative | undefined;

/** The version this build is. Empty when the native side isn't there, e.g. an older build. */
export async function currentVersion(): Promise<string> {
  try {
    return (await native()?.currentVersion()) ?? '';
  } catch {
    return '';
  }
}

export const downloadUpdate = (url: string) => {
  const m = native();
  if (!m) throw new Error('This build cannot update itself. Install the new version by hand.');
  return m.download(url);
};

export const installUpdate = (fileUri: string) => native()?.install(fileUri);

/** Calls back with how far the download has got, from 0 to 1. */
export function onDownloadProgress(listener: (progress: number) => void) {
  // An older build without the native side would have nothing to listen to, and asking anyway
  // throws, so say so plainly rather than letting it take the app down on startup.
  if (!NativeModules.AppUpdate) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.AppUpdate);
  // The emitter types its payload as a bare object, so read the one field we send.
  const sub = emitter.addListener('AppUpdateProgress', (e) => listener(Number((e as { progress?: number }).progress ?? 0)));
  return () => sub.remove();
}

export interface Release {
  version: string;
  apkUrl: string;
  notes: string;
}

/** Compares versions like 0.3.7 piece by piece, so 0.3.10 counts as newer than 0.3.9. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number(n) || 0);
  const [a, b] = [parts(candidate), parts(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * The newest published release, or null when there is nothing newer than what is installed.
 *
 * It reads the version.json the release workflow publishes beside the apk, which names the version
 * and where to fetch it. The release itself is always tagged "latest" so the download link never
 * moves, which means the tag says nothing about the version and this file is what does.
 */
export async function findUpdate(): Promise<Release | null> {
  const installed = await currentVersion();
  if (!installed) return null;
  try {
    const res = await fetch('https://github.com/VarshithChand/MusicApp/releases/latest/download/version.json', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { versionName?: string; apkUrl?: string; releaseNotes?: string };
    const version = body.versionName ?? '';
    const apkUrl = body.apkUrl ?? '';
    if (!version || !apkUrl || !isNewer(version, installed)) return null;
    return { version, apkUrl, notes: body.releaseNotes ?? '' };
  } catch {
    // An update check is never worth interrupting the app over.
    return null;
  }
}
