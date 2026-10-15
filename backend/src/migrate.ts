import fs from "fs";
import path from "path";
import { pool, usingDrive } from "./db";

// Run automatically before the server starts (see package.json's "start" script) — the free Render plan has no shell
// to run this by hand, so every schema change (always written as CREATE TABLE/COLUMN IF NOT EXISTS, so this is safe
// to rerun on every boot) ships itself on the next deploy.

async function main() {
  // With Google Drive as the store the schema is built in memory each time the data is loaded; there is no
  // database server here to apply it to.
  if (usingDrive) {
    console.log("Schema is applied when the data is loaded from Google Drive");
    return;
  }
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Schema applied");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
