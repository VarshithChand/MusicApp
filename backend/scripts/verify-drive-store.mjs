// Verifies the Google Drive store end to end, against a staging copy of the data.
//
//   node scripts/verify-drive-store.mjs [folder]        (default folder: MusicaStorage-staging)
//
// It runs the real backend in Drive mode on local ports and checks, in order: that it loads; that the public
// catalogue matches the live production server byte for byte; that sign-up, login, preferences, playlists
// and likes work, including when the same request arrives several times at once; that everything survives a
// restart and a shutdown straight after a change; that a second server writing the same data is caught
// rather than allowed to overwrite it; and that the migration refuses to overwrite existing data.
//
// It writes test accounts into the folder it is given, so never point it at the production folder.
import { spawn, execFileSync } from "node:child_process";

const FOLDER = process.argv[2] || "MusicaStorage-staging";
if (FOLDER === "MusicaStorage") {
  console.error("Refusing to run against the production folder; it creates test accounts.");
  process.exit(1);
}
const PROD = "https://musicapp-j5ji.onrender.com";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(port) {
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/index.ts"], {
    env: { ...process.env, DATA_STORE: "drive", GOOGLE_DRIVE_FOLDER_NAME: FOLDER, PORT: String(port) },
    // An IPC channel, so the test can ask for the orderly shutdown a deploy's SIGTERM triggers.
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.log = "";
  child.stdout.on("data", (d) => (child.log += d));
  child.stderr.on("data", (d) => (child.log += d));
  return child;
}

async function waitHealthy(port, ms = 180_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
    } catch {}
    await sleep(1000);
  }
  throw new Error(`server on ${port} did not become healthy`);
}

const stop = (child) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    // The same save-then-exit path as a deploy's SIGTERM, which Windows cannot deliver to a child process.
    if (child.connected) child.send("shutdown");
    else child.kill("SIGTERM");
  });

async function api(port, path, { method = "GET", token, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const canon = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));

async function waitSaved(port, generationBefore) {
  for (let i = 0; i < 60; i++) {
    const { json } = await api(port, "/health");
    const s = json.dataStore;
    if (!s.pendingChanges && s.generation > generationBefore) return s;
    await sleep(1000);
  }
  return (await api(port, "/health")).json.dataStore;
}

function rssMb(pid) {
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-Process -Id ${pid}).WorkingSet64`], { encoding: "utf8" });
    return Math.round(Number(out.trim()) / 1048576);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Verifying the Drive store against folder "${FOLDER}"\n`);
  const A = 4100;
  let server = startServer(A);
  let health;
  try {
    health = await waitHealthy(A);
  } catch (e) {
    console.log(server.log);
    throw e;
  }
  check("server loads its data from Drive", health.dataStore?.mode === "drive" && !!health.dataStore.loadedAt, `generation ${health.dataStore?.generation}`);

  // 1. The public catalogue, compared with the production server that still runs on PostgreSQL.
  for (const path of ["/songs", "/artists", "/albums", "/genres", "/moods", "/movies"]) {
    const [local, prod] = await Promise.all([api(A, path), fetch(PROD + path).then(async (r) => ({ status: r.status, json: await r.json() }))]);
    const same = local.status === prod.status && canon(local.json) === canon(prod.json);
    const size = Array.isArray(local.json) ? `${local.json.length} items` : "";
    check(`GET ${path} matches production`, same, same ? size : `local ${local.status}/${canon(local.json).length}b vs prod ${prod.status}/${canon(prod.json).length}b`);
  }

  // 2. Accounts: sign-up, the same sign-up five times at once, login, preferences.
  const email = `verify-${Date.now()}@example.com`;
  const signup = { name: "Verify", email, password: "verify-pass-123", gender: "male", dateOfBirth: "2000-01-15" };
  const reg = await api(A, "/auth/register", { method: "POST", body: signup });
  check("sign-up works", reg.status === 201 && !!reg.json?.accessToken);
  const twin = `verify-twin-${Date.now()}@example.com`;
  const burst = await Promise.all(Array.from({ length: 5 }, () => api(A, "/auth/register", { method: "POST", body: { ...signup, email: twin } })));
  const created = burst.filter((r) => r.status === 201).length;
  const others = [...new Set(burst.filter((r) => r.status !== 201).map((r) => r.status))];
  check("five identical sign-ups at once make exactly one account, the rest told 409", created === 1 && others.join() === "409", `${created} created, others ${others.join("/")}`);
  const login = await api(A, "/auth/login", { method: "POST", body: { email, password: signup.password } });
  check("login works (password hash check)", login.status === 200 && !!login.json?.accessToken);
  const wrong = await api(A, "/auth/login", { method: "POST", body: { email, password: "not-the-password" } });
  check("wrong password is refused", wrong.status === 401);
  const token = login.json?.accessToken;
  const prefs = await api(A, "/auth/me/preferences", { method: "PUT", token, body: { languages: ["te"] } });
  const me = await api(A, "/auth/me", { token });
  check("preferences save and read back", prefs.status === 200 && JSON.stringify(me.json?.languages) === '["te"]', `dob ${me.json?.date_of_birth}`);

  // 3. Playlists and likes, with simultaneous requests.
  const songs = (await api(A, "/songs")).json;
  const pl = await api(A, "/playlists", { method: "POST", token, body: { name: "Verify playlist" } });
  const playlistId = pl.json?.id;
  const adds = await Promise.all(songs.slice(0, 3).map((s) => api(A, `/playlists/${playlistId}/songs`, { method: "POST", token, body: { songId: s.id } })));
  const plGet = await api(A, `/playlists/${playlistId}`, { token });
  const plSongs = plGet.json?.songs?.length;
  check("playlist with three songs added at once", pl.status === 201 && adds.every((r) => r.status < 300) && plSongs === 3, `${plSongs} songs`);
  const likeId = songs[0].id;
  await Promise.all([1, 2, 3].map(() => api(A, `/songs/${likeId}/like`, { method: "POST", token })));
  const liked = (await api(A, "/users/me/liked-songs", { token })).json;
  check("liking the same song three times at once records it once", Array.isArray(liked) && liked.filter((s) => s.id === likeId).length === 1);

  // 4. Saved to Drive, and still there after a restart.
  const saved = await waitSaved(A, health.dataStore.generation);
  check("changes are written to Drive", !saved.pendingChanges && !saved.lastError && saved.generation > health.dataStore.generation, `generation ${health.dataStore.generation} -> ${saved.generation}`);
  const mem = rssMb(server.pid);
  check("memory fits a 512 MB server", mem !== null && mem < 450, mem === null ? "could not measure" : `${mem} MB`);
  await stop(server);
  server = startServer(A);
  await waitHealthy(A);
  const relogin = await api(A, "/auth/login", { method: "POST", body: { email, password: signup.password } });
  const t2 = relogin.json?.accessToken;
  const me2 = await api(A, "/auth/me", { token: t2 });
  const pl2 = await api(A, `/playlists/${playlistId}`, { token: t2 });
  const liked2 = (await api(A, "/users/me/liked-songs", { token: t2 })).json;
  check(
    "account, preferences, playlist and like all survive a restart",
    relogin.status === 200 && JSON.stringify(me2.json?.languages) === '["te"]' && pl2.json?.songs?.length === 3 && liked2?.some((s) => s.id === likeId),
  );

  // 5. A change made just before a shutdown is not lost: shutdown saves first.
  const renamed = `Renamed ${Date.now()}`;
  await api(A, `/playlists/${playlistId}`, { method: "PUT", token: t2, body: { name: renamed } });
  await stop(server);
  server = startServer(A);
  await waitHealthy(A);
  const t3 = (await api(A, "/auth/login", { method: "POST", body: { email, password: signup.password } })).json?.accessToken;
  const pl3 = await api(A, `/playlists/${playlistId}`, { token: t3 });
  check("a change made right before shutdown is saved", pl3.json?.name === renamed);

  // 6. Two servers on the same data: the second writer is stopped, not allowed to overwrite.
  const B = 4101;
  const second = startServer(B);
  const hb = await waitHealthy(B);
  await api(A, `/playlists/${playlistId}`, { method: "PUT", token: t3, body: { name: "Written by A" } });
  await waitSaved(A, hb.dataStore.generation);
  const tB = (await api(B, "/auth/login", { method: "POST", body: { email, password: signup.password } })).json?.accessToken;
  await api(B, `/playlists/${playlistId}`, { method: "PUT", token: tB, body: { name: "Written by B" } });
  let conflict = false;
  for (let i = 0; i < 30 && !conflict; i++) {
    await sleep(1000);
    conflict = (await api(B, "/health")).json.dataStore.conflict === true;
  }
  check("a second server writing the same data is caught, not allowed to overwrite", conflict);
  await stop(second);
  await stop(server);
  server = startServer(A);
  await waitHealthy(A);
  const t4 = (await api(A, "/auth/login", { method: "POST", body: { email, password: signup.password } })).json?.accessToken;
  const pl4 = await api(A, `/playlists/${playlistId}`, { token: t4 });
  check("the first server's data was kept", pl4.json?.name === "Written by A", `name is "${pl4.json?.name}"`);
  await stop(server);

  // 7. The migration will not overwrite data that is already there.
  let refused = false;
  try {
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/migrateToDrive.ts", "--folder", FOLDER], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    refused = /already holds data/.test(`${e.stdout}${e.stderr}`);
  }
  check("migration refuses to overwrite existing Drive data without --force", refused);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` -- FAILED: ${failed.map((f) => f.name).join("; ")}` : ""}`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => {
  console.error(`\nVerification stopped: ${e.message}`);
  process.exit(1);
});
