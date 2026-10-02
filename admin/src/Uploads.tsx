import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, UploadDetail, uploadZip } from "./api";
import { Card, Msg, useLoad } from "./ui";

const STATUS_TEXT: Record<string, string> = {
  processing: "Processing…",
  review: "Ready to review",
  failed: "Failed",
};

const MB = (bytes: number | null) => (bytes == null ? "" : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function JobDetail({ detail }: { detail: UploadDetail }) {
  const { job, items } = detail;
  const done = items.filter((i) => i.status === "ok").length;
  const dupes = items.filter((i) => i.status === "duplicate").length;
  const rejected = items.filter((i) => i.status === "rejected").length;
  return (
    <div className="job">
      <p>
        <b>{job.filename}</b> → {job.movie} · <span className={`badge ${job.status}`}>{STATUS_TEXT[job.status]}</span>
      </p>
      {job.status === "processing" && (
        <progress value={job.processed_files} max={Math.max(job.total_files, 1)} aria-label="Processing progress" />
      )}
      {job.error && <p className="msg error">{job.error}</p>}
      <p className="muted">
        {done} saved as drafts · {dupes} duplicate{dupes === 1 ? "" : "s"} skipped · {rejected} rejected
      </p>
      <ul className="items">
        {items.map((i) => (
          <li key={i.id} className={i.status}>
            <span className={`badge ${i.status}`}>{i.status === "ok" ? "Saved" : i.status === "duplicate" ? "Duplicate" : "Rejected"}</span>
            <span className="name">{i.file_name}</span>
            <span className="muted">{[MB(i.size), i.reason].filter(Boolean).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UploadsTab({ onReview }: { onReview: (movieId: number) => void }) {
  const movies = useLoad(api.movies);
  const history = useLoad(api.uploads);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [sending, setSending] = useState<number | null>(null); // upload fraction while the file is being sent
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const loadJob = useCallback(async (id: number) => {
    try {
      setDetail(await api.upload(id));
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  }, []);

  // While a job is processing, check on it every 2 seconds.
  useEffect(() => {
    if (jobId == null) return;
    let stop = false;
    const tick = async () => {
      try {
        const d = await api.upload(jobId);
        if (stop) return;
        setDetail(d);
        if (d.job.status === "processing") timer = window.setTimeout(tick, 2000);
        else history.reload();
      } catch {
        if (!stop) timer = window.setTimeout(tick, 4000);
      }
    };
    let timer = window.setTimeout(tick, 0);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    fd.set("zip", file);
    fd.set("rightsConfirmed", "true");
    setMsg(null);
    setDetail(null);
    setSending(0);
    try {
      const { jobId: id } = await uploadZip(fd, setSending);
      setJobId(id);
      setFile(null);
      form.current?.reset();
      setRights(false);
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <Card title="Upload a soundtrack (ZIP)">
        <p className="muted">
          Put the songs for one movie in a ZIP file (MP3, M4A, AAC or FLAC, up to 100 files and 300 MB). Files are checked, saved as drafts and
          hidden from users until you review and publish them. Uploading the same ZIP again is safe — songs already saved are skipped.
        </p>
        <form ref={form} onSubmit={submit}>
          <div className="grid">
            <label>
              Movie
              <select name="albumId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {movies.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                    {m.status === "draft" ? " (draft)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ZIP file
              <input type="file" accept=".zip,application/zip" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          {movies.data?.length === 0 && <p className="muted">Add a movie first (Movies tab).</p>}
          <label className="check">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            <span>I own these songs or have permission to distribute them. Uploading a ZIP does not give anyone that right.</span>
          </label>
          {sending !== null && (
            <div>
              <progress value={sending} max={1} aria-label="Upload progress" />
              <span className="muted"> Uploading… {Math.round(sending * 100)}%</span>
            </div>
          )}
          <div className="actions">
            <button className="btn primary" disabled={!file || !rights || sending !== null}>
              {sending !== null ? "Uploading…" : "Upload ZIP"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>

      {detail && (
        <Card title="Processing">
          <JobDetail detail={detail} />
          {detail.job.status === "review" && (
            <div className="actions">
              <button className="btn primary" onClick={() => onReview(detail.job.album_id)}>
                Review the songs
              </button>
            </div>
          )}
        </Card>
      )}

      <Card title="Upload history">
        {history.error && <span className="msg error">{history.error}</span>}
        {history.data?.length === 0 && <p className="muted">No uploads yet.</p>}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Movie</th>
                <th>File</th>
                <th>Status</th>
                <th>Files</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.data?.map((j) => (
                <tr key={j.id}>
                  <td>{new Date(j.created_at).toLocaleString()}</td>
                  <td>{j.movie}</td>
                  <td>{j.filename}</td>
                  <td>
                    <span className={`badge ${j.status}`}>{STATUS_TEXT[j.status]}</span>
                    {j.error && <div className="muted small-text">{j.error}</div>}
                  </td>
                  <td>
                    {j.processed_files}/{j.total_files}
                  </td>
                  <td>
                    <button
                      className="btn small"
                      onClick={() => {
                        setJobId(null);
                        loadJob(j.id);
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
