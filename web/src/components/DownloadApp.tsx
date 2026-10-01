import { ReactNode, useState } from "react";
import { API_URL } from "../api/http";

/**
 * Downloads the Android APK without leaving the page: shows a spinner and a percentage while the file
 * streams in, then saves it to the device.
 */
export function DownloadApp({ className, children }: { className: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setPct(0);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/app/download`);
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "The download failed. Please try again.");
      }

      const total = Number(res.headers.get("Content-Length")) || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setPct(total ? Math.min(100, Math.round((received / total) * 100)) : null);
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "music.apk";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the server. Check your connection." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="dl">
      <button type="button" className={className} onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {pct != null ? `Downloading ${pct}%` : "Downloading…"}
          </>
        ) : (
          children
        )}
      </button>
      {error && (
        <span className="error dl-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
