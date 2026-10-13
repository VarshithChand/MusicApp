import { NativeModules } from 'react-native';

/** Sets the screen brightness from 0 to 1 while the app is open. Does nothing where the module is missing. */
export function setScreenBrightness(level: number) {
  NativeModules.ScreenBrightness?.setBrightness(level).catch(() => {});
}
