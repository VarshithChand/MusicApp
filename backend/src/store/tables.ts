// How a table is written to Drive and read back: one JSON file per table, the same format whether it is
// produced by the migration from PostgreSQL or by the running server, so the two can be compared directly.
import crypto from "crypto";

type Run = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

/** Tables holding account data. They are encrypted before they leave the server. */
export const SENSITIVE_TABLES = new Set(["users"]);

export const MANIFEST = "manifest.json";
export const fileFor = (table: string) => `${table}.json`;

export interface Manifest {
  schemaVersion: 1;
  /** Goes up by one with every write, so two servers writing at once is noticed instead of one overwriting the other. */
  generation: number;
  writtenAt: string;
  writtenBy: string;
  tables: Record<string, { rows: number; sha256: string }>;
}

export const sha256 = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

export async function listTables(run: Run): Promise<string[]> {
  const res = await run(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return res.rows.map((r) => r.table_name as string);
}

/**
 * A table as JSON text. Rows are ordered by their own text so the same data always produces the same
 * file, which is what lets an unchanged table be recognised and left unwritten. Times are written in UTC
 * so the result does not depend on the database's timezone setting.
 */
export async function exportTable(run: Run, table: string): Promise<{ text: string; rows: number }> {
  await run("SET TIME ZONE 'UTC'");
  const res = await run(
    `SELECT COALESCE(json_agg(t ORDER BY t::text), '[]'::json)::text AS data, count(*)::int AS n FROM "${table}" t`,
  );
  return { text: res.rows[0].data as string, rows: Number(res.rows[0].n) };
}

/**
 * Empties tables before their saved rows are loaded. The schema seeds a few rows of its own (the default
 * moods), and the saved data already holds them, so loading on top of the seeds would collide.
 */
export async function clearTables(run: Run, tables: string[]): Promise<void> {
  if (!tables.length) return;
  await run(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/** Loads rows exported by exportTable. Postgres converts the JSON back to each column's real type. */
export async function importTable(run: Run, table: string, text: string): Promise<void> {
  await run(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, [text]);
}

/** After loading rows with their own ids, point every id counter past the highest one, so new rows never collide. */
export async function resetSequences(run: Run): Promise<void> {
  const res = await run(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`);
  for (const { table_name: t, column_name: c } of res.rows) {
    await run(
      `SELECT setval(pg_get_serial_sequence('"${t}"', '${c}'), COALESCE((SELECT max("${c}") FROM "${t}"), 0) + 1, false)`,
    );
  }
}

// --- Encryption for account data ------------------------------------------------------------------------

function key(): Buffer {
  const raw = process.env.DRIVE_ENCRYPTION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) {
    throw new Error("DRIVE_ENCRYPTION_KEY must be set to 32 random bytes in base64. Account data is never stored unencrypted.");
  }
  return k;
}

interface Sealed {
  encrypted: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
}

/** What actually goes in the file: the JSON itself, or for account tables an AES-256-GCM envelope around it. */
export function toFile(table: string, text: string): string {
  if (!SENSITIVE_TABLES.has(table)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const sealed: Sealed = {
    encrypted: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return JSON.stringify(sealed);
}

export function fromFile(table: string, fileText: string): string {
  if (!SENSITIVE_TABLES.has(table)) return fileText;
  const sealed = JSON.parse(fileText) as Sealed;
  if (sealed.encrypted !== "aes-256-gcm") throw new Error(`${table} is expected to be encrypted and is not.`);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  // A wrong key or a tampered file fails here, loudly, rather than loading garbage.
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8");
}
