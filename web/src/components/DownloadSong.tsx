import { useState } from "react";
import { api } from "../api";
import { Song } from "../api/types";
import { Icon } from "./Icon";

/** Download button for songs the admin has marked downloadable; renders nothing for other songs. */
export function DownloadSong({ song, className = "icon-btn" }: { song: Song; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!song.downloadable) return null;

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      // The server returns a short-lived link; the browser then downloads the file itself.
      const { url } = await api<{ url: string }>(`/songs/${song.id}/download-link`, { method: "POST" });
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={className} onClick={run} disabled={busy} aria-busy={busy} aria-label={`Download ${song.title}`} title={failed ? "Download failed — try again" : "Download"}>
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="download" size={20} />}
    </button>
  );
}
