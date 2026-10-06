import { NativeModules } from 'react-native';
import { Notifier } from './sync';

const native = NativeModules.LifeNotify;

function mod() {
  if (!native) {
    throw new Error('The notification module (LifeNotify) is missing. Rebuild the Android app.');
  }
  return native;
}

/** Reminders on the phone through the Kotlin module (alarms + notifications). Nothing leaves the phone. */
export const nativeNotifier: Notifier = {
  setSchedule: (items) => mod().setSchedule(JSON.stringify(items)),
  status: () => mod().status(),
  requestPermission: () => mod().requestPermission(),
};
