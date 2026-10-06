import { NativeModules } from 'react-native';
import { Db } from './types';

const native = NativeModules.LifeDb;

function mod() {
  if (!native) {
    throw new Error('The database module (LifeDb) is missing. Rebuild the Android app.');
  }
  return native;
}

/** The phone's own SQLite database through the Kotlin module in android/.../db/LifeDbModule.kt. */
export const nativeDb: Db = {
  execute: (sql, params = []) => mod().execute(sql, params),
  query: (sql, params = []) => mod().query(sql, params),
  executeScript: (statements) => mod().executeScript(statements),
};
