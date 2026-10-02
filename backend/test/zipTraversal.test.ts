import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "node:test";
import yauzl from "yauzl";
import { classifyEntry } from "../src/zipRules";
import { buildZip } from "./zipBuilder";

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  const file = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  fs.writeFileSync(file, buffer);
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => {
      fs.rmSync(file, { force: true });
      err || !zip ? reject(err) : resolve(zip);
    }),
  );
}

/** Reads every entry the way the upload job does; resolves with the entry names, rejects on the first error. */
function readAllEntries(zip: yauzl.ZipFile): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    zip.on("error", reject);
    zip.on("end", () => resolve(names));
    zip.on("entry", (entry: yauzl.Entry) => {
      names.push(entry.fileName);
      zip.readEntry();
    });
    zip.readEntry();
  });
}

test("a normal archive is read fully", async () => {
  const zip = await openZip(buildZip([{ name: "ok/01.mp3", data: Buffer.from("ID3") }, { name: "ok/02.mp3", data: Buffer.from("ID3") }]));
  assert.deepEqual(await readAllEntries(zip), ["ok/01.mp3", "ok/02.mp3"]);
});

test("hostile names are stopped either by the ZIP library or by our own check", async () => {
  const BS = String.fromCharCode(92); // a backslash
  for (const name of ["../evil.mp3", "ok/../../evil.mp3", "/etc/passwd.mp3", `..${BS}evil.mp3`, `C:${BS}evil.mp3`]) {
    const zip = await openZip(buildZip([{ name, data: Buffer.from("x") }]));
    let names: string[] = [];
    try {
      names = await readAllEntries(zip);
    } catch {
      continue; // the library refused the archive: safe
    }
    for (const n of names) assert.equal(classifyEntry(n, 1).kind, "reject", `entry ${JSON.stringify(n)} must be rejected`);
  }
});

test("garbage is not a ZIP", async () => {
  await assert.rejects(openZip(Buffer.from("this is not a zip file at all, just text")));
});
