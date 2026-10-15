// The app's data, kept in Google Drive and served from memory.
//
// At startup every table is read from Drive into an embedded Postgres engine (PGlite, Postgres compiled to
// WebAssembly and running inside this process). Requests run against it with ordinary SQL, so every route,
// constraint and upsert behaves exactly as it did against a database server -- in particular unique emails
// and ON CONFLICT stay atomic, because all of them pass through this single engine.
//
// After anything changes, the tables that actually changed are written back to Drive by one writer at a
// time, a couple of seconds later. That delay is the cost of this design: a crash (not a normal shutdown,
// which writes first) can lose the last few seconds of changes. It also means ONE server instance only --
// two would each hold their own copy. A generation number in the manifest catches that case and refuses to
// overwrite, rather than letting one copy silently erase the other.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PGlite, types } from "@electric-sql/pglite";
import { ensureFolder, listFiles, readText, writeText } from "./drive";
import { clearTables, exportTable, fileFor, fromFile, importTable, listTables, Manifest, MANIFEST, resetSequences, sha256, toFile } from "./tables";

const FOLDER_NAME = process.env.GOOGLE_DRIVE_FOLDER_NAME || "MusicaStorage";
/** Wait this long after the last change before writing, so a burst of changes is one write. */
const QUIET_MS = 2_000;
/** But never hold changes longer than this, however busy it gets. */
const MAX_WAIT_MS = 10_000;
const INSTANCE = `${process.env.RENDER_INSTANCE_ID ?? "local"}-${crypto.randomBytes(3).toString("hex")}`;
/** Statements that cannot change anything. Everything else might, so it schedules a write. */
const READ_ONLY = /^\s*(SELECT|SHOW|EXPLAIN|VALUES)\b/i;

let db: PGlite;
let folderId = "";
let fileIds = new Map<string, string>();
let tables: string[] = [];
let generation = 0;
const lastHash = new Map<string, string>();

let opening: Promise<void> | null = null;
let writing: Promise<void> | null = null;
let writeAgain = false;
let timer: NodeJS.Timeout | null = null;
let dirtySince: number | null = null;

const status = {
  loadedAt: null as string | null,
  lastWriteAt: null as string | null,
  lastError: null as string | null,
  conflict: false,
};

/** node-postgres reads a bare date as local midnight; match it, so dates mean the same day either way. */
function parseDateLikePg(v: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : v;
}

const run = (text: string, params: unknown[] = []) => db.query(text, params) as Promise<{ rows: any[] }>;

async function load(): Promise<void> {
  db = new PGlite({
    // Return values in the same shapes node-postgres did, so no route sees a difference:
    // bigints (and so every count(*)) as strings, and dates as local midnight.
    parsers: { [types.INT8]: (v: string) => v, [types.DATE]: parseDateLikePg },
  });
  await db.exec("SET TIME ZONE 'UTC'");
  const schema = fs.readFileSync(path.join(__dirname, "..", "..", "db", "schema.sql"), "utf8");
  await db.exec(schema);
  tables = await listTables(run);

  folderId = await ensureFolder(FOLDER_NAME);
  fileIds = await listFiles(folderId);
  const manifestId = fileIds.get(MANIFEST);
  if (!manifestId) {
    // An empty folder is how a mistyped folder name or a fresh account looks. Starting anyway would serve an
    // empty app and then save over nothing; refusing makes the mistake visible instead.
    if (process.env.DRIVE_ALLOW_EMPTY !== "true") {
      throw new Error(`No data found in Drive folder "${FOLDER_NAME}". Run the migration first, or set DRIVE_ALLOW_EMPTY=true for a fresh start.`);
    }
  }
  const manifest = manifestId ? (JSON.parse(await readText(manifestId)) as Manifest) : null;
  generation = manifest?.generation ?? 0;

  // Rows arrive with their own ids and references, so check those once at the end, not table by table.
  const saved = tables.filter((t) => fileIds.has(fileFor(t)));
  await db.exec("SET session_replication_role = replica");
  await clearTables(run, saved);
  for (const table of saved) {
    const text = fromFile(table, await readText(fileIds.get(fileFor(table))!));
    lastHash.set(table, sha256(text));
    await importTable(run, table, text);
    const expected = manifest?.tables[table]?.rows;
    const got = Number((await run(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n);
    if (expected !== undefined && expected !== got) {
      // Tables are written before the manifest, so a write cut short leaves newer tables beside an older
      // manifest. The tables are the more recent truth; say so, and carry on with them.
      console.warn(`drive store: ${table} has ${got} rows, manifest says ${expected} -- keeping the table as written`);
    }
  }
  await db.exec("SET session_replication_role = origin");
  await resetSequences(run);

  // Apply the schema once more over the loaded data, exactly as a database server re-applies it at every
  // boot: new seed rows and columns added in a later release arrive on top of what was saved.
  await db.exec(schema);

  // lastHash holds what Drive has. If the schema just added anything, or a table had no file yet, write it.
  for (const table of tables) {
    if (lastHash.get(table) !== sha256((await exportTable(run, table)).text)) {
      scheduleWrite();
      break;
    }
  }
  status.loadedAt = new Date().toISOString();
  console.log(`drive store: loaded ${tables.length} tables from "${FOLDER_NAME}" (generation ${generation})`);
}

export function open(): Promise<void> {
  opening ??= load();
  return opening;
}

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  await open();
  const res = await run(text, params);
  if (!READ_ONLY.test(text)) scheduleWrite();
  return res.rows as T[];
}

function scheduleWrite(): void {
  dirtySince ??= Date.now();
  if (timer) clearTimeout(timer);
  const wait = Math.max(0, Math.min(QUIET_MS, dirtySince + MAX_WAIT_MS - Date.now()));
  timer = setTimeout(() => void flush(), wait);
}

/** Writes every changed table to Drive. Only one write runs at a time; a request during one queues another. */
export async function flush(): Promise<void> {
  if (!opening) return;
  if (writing) {
    writeAgain = true;
    return writing;
  }
  writing = writeChanges();
  try {
    await writing;
  } finally {
    writing = null;
    if (writeAgain) {
      writeAgain = false;
      await flush();
    }
  }
}

async function writeChanges(): Promise<void> {
  await opening;
  if (timer) clearTimeout(timer);
  timer = null;
  dirtySince = null;
  if (status.conflict) return;

  const changed: { table: string; text: string; rows: number }[] = [];
  const all: Manifest["tables"] = {};
  for (const table of tables) {
    const { text, rows } = await exportTable(run, table);
    const hash = sha256(text);
    all[table] = { rows, sha256: hash };
    if (lastHash.get(table) !== hash) changed.push({ table, text, rows });
  }
  if (!changed.length) return;

  try {
    // Someone else wrote since this server last did: another instance is running. Stop rather than erase it.
    const manifestId = fileIds.get(MANIFEST);
    if (manifestId) {
      const remote = JSON.parse(await readText(manifestId)) as Manifest;
      if (remote.generation !== generation) {
        status.conflict = true;
        status.lastError = `Drive data was changed by ${remote.writtenBy} (generation ${remote.generation}, expected ${generation}); this server stopped writing so neither copy overwrites the other.`;
        console.error(`drive store: CONFLICT -- ${status.lastError}`);
        return;
      }
    }
    // Tables first, manifest last: the manifest only ever describes files that are already in place.
    for (const { table, text } of changed) {
      const id = await writeText(folderId, fileFor(table), toFile(table, text), fileIds.get(fileFor(table)));
      fileIds.set(fileFor(table), id);
    }
    const manifest: Manifest = {
      schemaVersion: 1,
      generation: generation + 1,
      writtenAt: new Date().toISOString(),
      writtenBy: INSTANCE,
      tables: all,
    };
    fileIds.set(MANIFEST, await writeText(folderId, MANIFEST, JSON.stringify(manifest, null, 2), fileIds.get(MANIFEST)));
    generation = manifest.generation;
    for (const { table, text } of changed) lastHash.set(table, sha256(text));
    status.lastWriteAt = manifest.writtenAt;
    status.lastError = null;
  } catch (e) {
    // Leave the hashes alone so the same changes are tried again, and try again soon.
    status.lastError = e instanceof Error ? e.message : String(e);
    console.error(`drive store: write failed, will retry -- ${status.lastError}`);
    scheduleWrite();
  }
}

/** For /health: whether data is loaded and saving, and why not if it is not. Never includes credentials. */
export function storeStatus() {
  return {
    mode: "drive",
    folder: FOLDER_NAME,
    generation,
    pendingChanges: dirtySince !== null || writing !== null,
    ...status,
  };
}
