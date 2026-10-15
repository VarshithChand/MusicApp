import "dotenv/config";
import { Pool } from "pg";
import * as driveDb from "./store/driveDb";

/**
 * Where the app's data lives. DATA_STORE=drive keeps it in Google Drive, served from memory by an embedded
 * Postgres engine (see store/driveDb.ts); anything else keeps the PostgreSQL server. Every route goes
 * through query() below, so this one setting is the whole switch, and switching back is the same setting.
 */
export const usingDrive = process.env.DATA_STORE === "drive";

// Hosted providers (Aiven, Neon) append ?sslmode=require to the URL. Newer pg versions turn that into a
// strict certificate check that managed-database certificates fail, so drop it and configure SSL here.
function connectionString(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return raw;
  }
}

const sslRequired = process.env.DATABASE_SSL === "true" || /sslmode=require/.test(process.env.DATABASE_URL ?? "");

const pg = usingDrive
  ? null
  : new Pool({
      connectionString: connectionString(),
      ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
    });

interface QueryablePool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

/** The scripts that close the pool when done get a final save to Drive instead, so nothing is left unwritten. */
export const pool: QueryablePool = pg ?? {
  query: async (text, params = []) => ({ rows: await driveDb.query(text, params) }),
  end: () => driveDb.flush(),
};

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  if (usingDrive) return driveDb.query<T>(text, params);
  const res = await pg!.query(text, params);
  return res.rows as T[];
}

/** Resolves once data can be served: immediately for PostgreSQL, after loading from Drive otherwise. */
export const ready = (): Promise<void> => (usingDrive ? driveDb.open() : Promise.resolve());

/** Saves anything not yet written. Called on shutdown, so a normal restart loses nothing. */
export const closeStore = (): Promise<void> => (usingDrive ? driveDb.flush() : pg!.end());

export const storeStatus = () => (usingDrive ? driveDb.storeStatus() : { mode: "postgres" });
