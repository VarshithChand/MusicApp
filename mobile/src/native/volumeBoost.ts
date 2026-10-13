import { NativeModules } from 'react-native';

/** Sends the boost (100 = normal, up to 200) to the native player. Silently does nothing until that module exists. */
export function setVolumeBoost(percent: number) {
  NativeModules.VolumeBoost?.setBoost(percent).catch(() => {});
}
