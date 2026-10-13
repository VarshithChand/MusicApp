import { NativeModules } from 'react-native';

/** Switches the home-screen icon between the yellow ('dark') and blue ('light') launcher entries. Android only. */
export function setAppIconVariant(variant: 'dark' | 'light') {
  NativeModules.AppIcon?.setVariant(variant).catch(() => {});
}
