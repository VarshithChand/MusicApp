import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { Permission } from 'react-native';
import { LocalAudioFile, LocalVideoFile } from './types';

interface LocalMediaNative {
  listAudio(): Promise<LocalAudioFile[]>;
  listVideo(): Promise<LocalVideoFile[]>;
  deleteMedia(uri: string): Promise<boolean>;
}

function native(): LocalMediaNative {
  const m = NativeModules.LocalMedia as LocalMediaNative | undefined;
  if (!m) {
    throw new Error('The local media module is missing. Rebuild the Android app.');
  }
  return m;
}

/** Android 13+ split one storage permission into two; below that, one broader legacy permission covers both. */
function permissionFor(kind: 'audio' | 'video'): Permission | null {
  if (Platform.OS !== 'android') return null;
  if (Platform.Version >= 33) {
    return kind === 'audio' ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO : PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO;
  }
  return PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
}

/** Asks for the permission this kind of media needs. Resolves true only if it was granted. */
export async function requestLocalMediaPermission(kind: 'audio' | 'video'): Promise<boolean> {
  const permission = permissionFor(kind);
  if (!permission) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: kind === 'audio' ? 'Local music' : 'Local videos',
    message: `Let Musica read the ${kind} files already on this phone. Nothing is uploaded.`,
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function hasLocalMediaPermission(kind: 'audio' | 'video'): Promise<boolean> {
  const permission = permissionFor(kind);
  if (!permission) return true;
  return PermissionsAndroid.check(permission);
}

/**
 * Deletes a file from the phone for good. From Android 11 the system asks the owner to confirm,
 * so false means they declined -- the file is still there and nothing went wrong.
 */
export const deleteLocalMedia = (uri: string): Promise<boolean> => native().deleteMedia(uri);

export const listLocalAudio = (): Promise<LocalAudioFile[]> => native().listAudio();
export const listLocalVideo = (): Promise<LocalVideoFile[]> => native().listVideo();
