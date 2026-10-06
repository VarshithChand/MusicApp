# Apps download page (`deploymentportal.in/apps`)

A single static page that lists our Android apps with two sections:

1. **Latest**: one card per app with its newest version and a **Download APK** button.
2. **Previous versions**: a table per app with every earlier version (version, date, size, APK and SHA-256 links).

It reads the public GitHub releases of this repository in the visitor's browser, so there is **nothing to update by hand**: when a pipeline publishes a new version, the page shows it, and the old one moves to "Previous versions". No server, database or key is involved.

## Files

```
apps-site/
  index.html        redirects "/" to "/apps/"
  apps/index.html   the page (HTML, CSS and JavaScript in one file, no build step)
```

## How versions are found

| App | Release tags it reads | Notes |
|---|---|---|
| Music | `v0.2.4`, `v0.2.5` ... | The pipeline `android.yml` creates one release per version from now on |
| App Locker | `locker-v1.0.0` ... (signed) and `locker-test-v1.0.1` ... (TEST, debug-signed) | `locker-test` builds are marked **TEST**. A stable release is always preferred over a newer test build for "Latest" |
| Life Tracker | `tracker-v0.2.0` ... (signed) and `tracker-test-v0.2.0` ... (TEST, debug-signed) | Pipeline `lifetracker.yml`. No internet permission, checked by the pipeline |

Rolling releases (`latest`, `locker-latest`, `locker-test`) are only a fallback for "Latest" until a versioned release exists. That is why Music shows "Newest build" today: versions before this change were not kept, so Music's history starts with its next build.

Versions sort as numbers (0.2.10 is newer than 0.2.9). Drafts are ignored.

## Downloads go through the site, not GitHub

On `admin.deploymentportal.in` (and `*.pages.dev`) the buttons point at `/apps/get?tag=...&name=...`, a Cloudflare Pages Function (`admin/functions/apps/get.ts`) that streams the file from the GitHub release with `Content-Disposition: attachment`. The browser then just saves the APK from our own address. A direct github.com link can be opened by the GitHub app or a GitHub page on a phone instead. The function only serves `.apk` / `.apk.sha256` files from release tags this repository uses (allow-lists in the file). On any other address the page falls back to the direct GitHub link. Tested locally with `wrangler pages dev` (correct headers, real APK bytes, bad names give 404); not yet tested on the deployed site.

## Serve it at `admin.deploymentportal.in/apps` (chosen address)

The admin site build includes the page, so deploying the admin site also publishes `/apps`. There is still only one copy of the page (`apps-site/apps/`); `admin/vite.config.ts` copies it into the build and serves it while developing.

You do this in the Cloudflare dashboard (I have no access to it):

1. Workers & Pages -> Create -> Pages -> Connect to Git -> this repository.
2. Settings: **Root directory** `admin`, **Build command** `npm run build`, **Build output directory** `dist`, **Production branch** `main`.
3. Environment variable: `NODE_VERSION` = `22`.
4. After the first deploy: the project's **Custom domains** -> add `admin.deploymentportal.in` (Cloudflare creates the DNS record).
5. Open `https://admin.deploymentportal.in/apps`.

Notes:
- `/apps` is public: anyone with the link can see it, while the admin panel itself still needs a login.
- This also deploys the admin panel (phase 10 of the plan). The backend already accepts requests from any website address, so the admin screens can reach it without extra settings; the admin code already defaults to the Render URL (`VITE_API_URL` can override it).
- Locally: `cd admin && npm run dev`, then open `http://localhost:5173/apps`.

## Other ways to host it

You do this in the Cloudflare dashboard (I have no access to it).

**If `deploymentportal.in` is not used by another site yet**
1. Workers & Pages -> Create -> Pages -> Connect to Git -> this repository.
2. Build command: leave empty. Build output directory: `apps-site`. Production branch: `main`.
3. After the first deploy: the project's Custom domains -> add `deploymentportal.in`.
4. Open `https://deploymentportal.in/apps`.

**If `deploymentportal.in` already serves another site**
- Copy the folder `apps-site/apps/` into that site as `/apps/`. The page works from any path because it uses no relative files.
- Or give this project its own address (for example `apps.deploymentportal.in`); the page is then at `https://apps.deploymentportal.in/apps/`, and `https://apps.deploymentportal.in/` redirects to it.

Every push to `main` redeploys, but you rarely need to touch the page.

## Limits

- GitHub allows 60 anonymous API requests per hour per visitor IP. Plenty for a downloads page; if exceeded, the page shows a link to the GitHub releases instead.
- The repository must stay **public**, otherwise visitors cannot read the releases or download the files.
- A TEST build is signed with the public Android debug key. Uninstall it before installing a properly signed version.
- To add another app, add one entry to the `APPS` list at the top of the script in `apps-site/apps/index.html` (name, description, tag pattern).

## Tested

Run in a headless browser DOM against the real GitHub data (Music and the App Locker test build both appear with working links) and against sample releases (numeric version order, stable preferred over newer test builds, drafts ignored, previous-versions table). Not yet viewed in a real browser on a phone.
