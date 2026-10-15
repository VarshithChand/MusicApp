// Copies every table from PostgreSQL into Google Drive, then proves the copy is complete and loadable.
//
//   npm run migrate:postgres-to-drive -- --dry-run            files on disk only, nothing sent to Drive
//   npm run migrate:postgres-to-drive -- --folder NAME        upload into that Drive folder
//   npm run migrate:postgres-to-drive -- --folder NAME --force   replace data already in that folder
//
// PostgreSQL is read inside a READ ONLY transaction, so this command cannot change or delete anything there.
// It is safe to run as often as needed; the database stays exactly as it was.
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { ensureFolder, listFiles, readText, writeText } from "./store/drive";
import { clearTables, exportTable, fileFor, fromFile, importTable, listTables, Manifest, MANIFEST, resetSequences, sha256, toFile } from "./store/tables";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const FOLDER = args[args.indexOf("--folder") + 1] && args.includes("--folder") ? args[args.indexOf("--folder") + 1] : "MusicaStorage";
const OUT = path.join(__dirname, "..", "migration-out");

type Run = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

interface TableReport {
  table: string;
  sourceRows: number;
  sha256: string;
  loadedRows?: number;
  inDrive?: { rows: number; sha256Match: boolean };
}

/** Every foreign key, checked for rows pointing at something that is not there. */
async function orphans(run: Run): Promise<{ constraint: string; orphans: number }[]> {
  const fks = (
    await run(`
      SELECT con.conname AS name, child.relname AS child, parent.relname AS parent,
             array_agg(ca.attname ORDER BY k.ord) AS child_cols, array_agg(pa.attname ORDER BY k.ord) AS parent_cols
        FROM pg_constraint con
        JOIN pg_class child ON child.oid = con.conrelid
        JOIN pg_class parent ON parent.oid = con.confrelid
        JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(ck, pk, ord) ON true
        JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k.ck
        JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.pk
       WHERE con.contype = 'f'
       GROUP BY con.conname, child.relname, parent.relname`)
  ).rows;
  const out = [];
  for (const fk of fks) {
    const childCols = (fk.child_cols as string[]).map((c) => `c."${c}"`);
    const match = (fk.child_cols as string[]).map((c, i) => `p."${(fk.parent_cols as string[])[i]}" = c."${c}"`).join(" AND ");
    const n = (
      await run(
        `SELECT count(*) AS n FROM "${fk.child}" c WHERE ${childCols.map((c) => `${c} IS NOT NULL`).join(" AND ")}
           AND NOT EXISTS (SELECT 1 FROM "${fk.parent}" p WHERE ${match})`,
      )
    ).rows[0].n;
    out.push({ constraint: fk.name as string, orphans: Number(n) });
  }
  return out;
}

async function main() {
  console.log(`${DRY_RUN ? "DRY RUN -- nothing will be sent to Drive" : `Target: Drive folder "${FOLDER}"`}\n`);

  // 1. Read every table from PostgreSQL in one consistent, read-only snapshot.
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set; it is the database being copied from.");
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  const pgClient = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  const fromPg: Run = (t, p = []) => pgClient.query(t, p as any[]);
  await fromPg("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const tables = await listTables(fromPg);
  const exported = new Map<string, { text: string; rows: number }>();
  for (const t of tables) exported.set(t, await exportTable(fromPg, t));
  await fromPg("ROLLBACK");
  await pgClient.end();
  console.log(`Read ${tables.length} tables from PostgreSQL (read-only).`);

  // 2. Prove the copy loads: build the schema in a fresh engine, load every table, check counts and references.
  const lite = new PGlite();
  const run: Run = (t, p = []) => lite.query(t, p) as Promise<{ rows: any[] }>;
  await lite.exec(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
  await lite.exec("SET session_replication_role = replica");
  await clearTables(run, tables);
  for (const t of tables) await importTable(run, t, exported.get(t)!.text);
  await lite.exec("SET session_replication_role = origin");
  await resetSequences(run);
  const report: TableReport[] = [];
  for (const t of tables) {
    const { text, rows } = exported.get(t)!;
    const loaded = Number((await run(`SELECT count(*) AS n FROM "${t}"`)).rows[0].n);
    report.push({ table: t, sourceRows: rows, sha256: sha256(text), loadedRows: loaded });
  }
  const broken = (await orphans(run)).filter((o) => o.orphans > 0);

  // 3. Write it: to disk for a dry run, to Drive otherwise, then read Drive back to check every byte arrived.
  const manifest: Manifest = {
    schemaVersion: 1,
    generation: 1,
    writtenAt: new Date().toISOString(),
    writtenBy: "migrate:postgres-to-drive",
    tables: Object.fromEntries(report.map((r) => [r.table, { rows: r.sourceRows, sha256: r.sha256 }])),
  };

  if (DRY_RUN) {
    const dir = path.join(OUT, "dry-run");
    fs.mkdirSync(dir, { recursive: true });
    for (const t of tables) fs.writeFileSync(path.join(dir, fileFor(t)), toFile(t, exported.get(t)!.text));
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest, null, 2));
  } else {
    const folderId = await ensureFolder(FOLDER);
    const existing = await listFiles(folderId);
    if (existing.has(MANIFEST) && !FORCE) {
      throw new Error(`Drive folder "${FOLDER}" already holds data. Nothing was changed. Add --force to replace it.`);
    }
    for (const t of tables) {
      const id = await writeText(folderId, fileFor(t), toFile(t, exported.get(t)!.text), existing.get(fileFor(t)));
      existing.set(fileFor(t), id);
    }
    await writeText(folderId, MANIFEST, JSON.stringify(manifest, null, 2), existing.get(MANIFEST));
    for (const r of report) {
      const back = fromFile(r.table, await readText(existing.get(fileFor(r.table))!));
      r.inDrive = { rows: (JSON.parse(back) as unknown[]).length, sha256Match: sha256(back) === r.sha256 };
    }
  }

  // 4. The reconciliation report: counts and checksums only, never the data itself.
  const problems = report.filter(
    (r) => r.loadedRows !== r.sourceRows || (r.inDrive && (!r.inDrive.sha256Match || r.inDrive.rows !== r.sourceRows)),
  );
  console.log("\n table                    source   loaded" + (DRY_RUN ? "" : "   drive  checksum"));
  for (const r of report) {
    const line = ` ${r.table.padEnd(22)} ${String(r.sourceRows).padStart(7)} ${String(r.loadedRows).padStart(8)}`;
    console.log(line + (r.inDrive ? ` ${String(r.inDrive.rows).padStart(7)}  ${r.inDrive.sha256Match ? "match" : "MISMATCH"}` : ""));
  }
  console.log(`\nReferences checked: ${broken.length ? broken.map((b) => `${b.constraint} has ${b.orphans} orphans`).join(", ") : "all intact"}`);
  console.log(problems.length || broken.length ? "\nRESULT: PROBLEMS FOUND -- do not switch over." : "\nRESULT: complete and verified.");

  fs.mkdirSync(OUT, { recursive: true });
  const reportPath = path.join(OUT, `report-${DRY_RUN ? "dry-run" : FOLDER}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ dryRun: DRY_RUN, folder: FOLDER, manifest, report, brokenReferences: broken }, null, 2));
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  if (problems.length || broken.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\nMigration stopped: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
