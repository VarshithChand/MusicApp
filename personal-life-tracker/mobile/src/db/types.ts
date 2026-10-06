/** What the app needs from a SQLite database. The real one is the native module (nativeDb.ts); tests use an in-memory one. */
export interface Db {
  /** Runs one INSERT/UPDATE/DELETE. Resolves with the new row id for an INSERT, otherwise the number of rows changed. */
  execute(sql: string, params?: (string | number | boolean | null)[]): Promise<number>;
  query<T = Record<string, string | number | null>>(sql: string, params?: (string | number | boolean | null)[]): Promise<T[]>;
  /** Runs several statements in ONE transaction: all succeed or none are applied. */
  executeScript(statements: string[]): Promise<void>;
}
