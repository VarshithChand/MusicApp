// One-time sign-in that lets the server use your Google Drive.
//
//   node scripts/drive-auth.mjs <path to the downloaded client_secret_….json>
//
// It opens Google's sign-in page, waits for you to approve, then writes the client id, client secret
// and refresh token into backend/.env. The token is never printed: it is a password to your Drive,
// and a terminal's scrollback is no place to keep one.
//
// Access is limited to the drive.file scope -- files this app creates, and nothing else in your Drive.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");

const keyPath = process.argv[2];
if (!keyPath || !existsSync(keyPath)) {
  console.error("Give the path to the downloaded client_secret_….json file.");
  process.exit(1);
}
const { installed } = JSON.parse(readFileSync(keyPath, "utf8"));
if (!installed?.client_id || !installed?.client_secret) {
  console.error('That file is not a "Desktop app" OAuth client. Create one under Clients -> Desktop app.');
  process.exit(1);
}

/** Sets or replaces KEY=value lines in backend/.env, leaving every other line as it was. */
function saveToEnv(values) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(ENV_PATH, text);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  if (!code && !denied) {
    res.writeHead(404).end();
    return;
  }
  if (denied) {
    res.end("Sign-in was cancelled. You can close this tab.");
    console.error(`Google said: ${denied}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const tokenRes = await fetch(installed.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: installed.client_id,
        client_secret: installed.client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.refresh_token) {
      throw new Error(token.error_description || token.error || "Google returned no refresh token.");
    }

    // Prove the token works before saving it: list the files this app can see (none yet is fine).
    const check = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!check.ok) throw new Error(`Drive refused the new token (HTTP ${check.status}). Is the Drive API enabled?`);

    saveToEnv({
      GOOGLE_DRIVE_CLIENT_ID: installed.client_id,
      GOOGLE_DRIVE_CLIENT_SECRET: installed.client_secret,
      GOOGLE_DRIVE_REFRESH_TOKEN: token.refresh_token,
    });
    res.end("Done. Musica can now use your Google Drive. You can close this tab.");
    console.log("Signed in, checked against Drive, and saved to backend/.env (the token was not printed).");
  } catch (e) {
    res.end("Something went wrong. Check the terminal.");
    console.error(`Failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

let redirectUri;
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const consent = new URL(installed.auth_uri);
  consent.search = new URLSearchParams({
    client_id: installed.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    // offline + consent is what makes Google hand back a refresh token, not just a short-lived one.
    access_type: "offline",
    prompt: "consent",
  }).toString();
  console.log("Open this link, sign in with your Gmail, and approve:\n");
  console.log(consent.toString());
  console.log("\nWaiting for you to approve…");
});
