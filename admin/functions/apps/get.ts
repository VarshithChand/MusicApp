// Cloudflare Pages Function: GET /apps/get?tag=<release tag>&name=<file>
//
// Streams a release file from this repository's GitHub releases so the browser downloads it straight from
// admin.deploymentportal.in. Without it the button points at github.com, and phones with the GitHub app installed can
// open that link in the GitHub app or a GitHub page instead of simply downloading the file.
// Only this repository's APK / checksum files are served (see the allow-lists below); it is not an open proxy.

const REPO = "VarshithChand/MusicApp";
const TAG = /^(v|locker-v|locker-test-v|tracker-v|tracker-test-v)\d+\.\d+\.\d+$|^(latest|locker-latest|locker-test|tracker-latest|tracker-test)$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(apk|apk\.sha256)$/;

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const tag = url.searchParams.get("tag") ?? "";
  const name = url.searchParams.get("name") ?? "";
  if (!TAG.test(tag) || !NAME.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${name}`, { redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", name.endsWith(".apk") ? "application/vnd.android.package-archive" : "text/plain; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="${name}"`);
  const length = upstream.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: 200, headers });
};
