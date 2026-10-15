// A small Google Drive client for the one folder the app keeps its data in.
//
// It signs in with the refresh token written by scripts/drive-auth.mjs and is limited to the drive.file scope,
// so it can only ever see files it created itself -- nothing else in the Drive it is connected to.
// Only the server talks to Drive; no credential here ever reaches the app or a browser.

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_TYPE = "application/vnd.google-apps.folder";

let cached: { value: string; expires: number } | null = null;

function credentials() {
  const id = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) {
    throw new Error("Google Drive is not configured: set GOOGLE_DRIVE_CLIENT_ID, _CLIENT_SECRET and _REFRESH_TOKEN.");
  }
  return { id, secret, refresh };
}

async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expires) return cached.value;
  const { id, secret, refresh } = credentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    // invalid_grant almost always means the sign-in expired (7 days while the Google app is in Testing).
    throw new Error(`Google refused the Drive sign-in (${body.error ?? res.status}). Re-run scripts/drive-auth.mjs.`);
  }
  // Renew a minute early rather than racing the expiry.
  cached = { value: body.access_token, expires: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000 };
  return cached.value;
}

/**
 * One request to Drive, retried with growing waits when Drive is busy (429) or briefly failing (5xx).
 * Anything else is a real answer and is returned as it is.
 */
async function call(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await accessToken()}` },
    });
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) return res;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
  }
}

async function ok(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw new Error(`Drive ${what} failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
}

const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** The app's folder, found by name, or created on first use. */
export async function ensureFolder(name: string): Promise<string> {
  const q = `name='${quote(name)}' and mimeType='${FOLDER_TYPE}' and trashed=false`;
  const res = await ok(await call(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,createdTime)&orderBy=createdTime`), "folder lookup");
  const { files } = (await res.json()) as { files: { id: string }[] };
  if (files.length) return files[0].id;
  const created = await ok(
    await call(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_TYPE }),
    }),
    "folder create",
  );
  return ((await created.json()) as { id: string }).id;
}

/** Every file in the folder, by name. */
export async function listFiles(folderId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const q = `'${quote(folderId)}' in parents and trashed=false`;
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await ok(await call(url), "file list");
    const body = (await res.json()) as { nextPageToken?: string; files: { id: string; name: string }[] };
    for (const f of body.files) out.set(f.name, f.id);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

export async function readText(fileId: string): Promise<string> {
  const res = await ok(await call(`${API}/files/${fileId}?alt=media`), "download");
  return res.text();
}

/**
 * Writes a file, replacing its content in one request when it exists so a reader never sees half of it.
 * Drive keeps the earlier versions for a while, which is the way back from a bad write.
 */
export async function writeText(folderId: string, name: string, text: string, existingId?: string): Promise<string> {
  if (existingId) {
    await ok(
      await call(`${UPLOAD}/files/${existingId}?uploadType=media&fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: text,
      }),
      `update of ${name}`,
    );
    return existingId;
  }
  const boundary = `musica${Date.now()}${Math.random().toString(16).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId], mimeType: "application/json" }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
  const res = await ok(
    await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }),
    `create of ${name}`,
  );
  return ((await res.json()) as { id: string }).id;
}
