import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, MovieSuggestion, UploadConflict, UploadDetail, uploadZip } from "./api";
import { Card, Msg, useLoad } from "./ui";

const STATUS_TEXT: Record<string, string> = {
  processing: "Processing…",
  review: "Ready to review",
  failed: "Failed",
};

const LANGUAGES = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "English", "Other"];
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
        <>
          <progress value={job.processed_files} max={Math.max(job.total_files, 1)} aria-label="Processing progress" />
          <p className="muted small-text">
            {job.processed_files} of {job.total_files} files checked. Each song is also analysed for tempo and energy, so this can take a little while.
          </p>
        </>
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
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState("");
  const [typedName, setTypedName] = useState("");
  const [suggestion, setSuggestion] = useState<MovieSuggestion | null>(null);
  const [confirmName, setConfirmName] = useState(false);
  const [createAnyway, setCreateAnyway] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
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

  // When a ZIP is chosen, ask the server what movie name its file name suggests and which movies it might duplicate.
  useEffect(() => {
    setSuggestion(null);
    setConfirmName(false);
    setCreateAnyway(false);
    if (!file) return;
    let cancelled = false;
    api
      .suggestMovie(file.name)
      .then((s) => !cancelled && setSuggestion(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file]);

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

  // The name that will be used, following the rules: typed name first, otherwise the file name.
  const effectiveName = typedName.trim() || suggestion?.name || "";
  const needsConfirmation = target === "new" && !typedName.trim() && !!suggestion?.ambiguous;
  const duplicates = target === "new" ? (typedName.trim() ? [] : suggestion?.matches ?? []) : [];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData(e.currentTarget);
    fd.set("zip", file);
    fd.set("rightsConfirmed", "true");
    if (target === "existing") {
      fd.set("albumId", existingId);
      for (const k of ["movieName", "language", "releaseYear", "musicDirector", "description"]) fd.delete(k);
    } else {
      fd.delete("albumId");
      if (typedName.trim()) fd.set("movieName", typedName.trim());
      else fd.delete("movieName");
      if (confirmName) fd.set("confirmName", "true");
      if (createAnyway) fd.set("createAnyway", "true");
    }
    setMsg(null);
    setDetail(null);
    setSending(0);
    try {
      const result = await uploadZip(fd, setSending);
      setJobId(result.jobId);
      setMsg({
        kind: "ok",
        text:
          result.nameSource === "existing"
            ? `Added to "${result.movieName}".`
            : `Created the draft movie "${result.movieName}" (${result.nameSource === "manual" ? "the name you typed" : "name taken from the file name"}).`,
      });
      movies.reload();
      setFile(null);
      setTypedName("");
      form.current?.reset();
      setRights(false);
    } catch (err) {
      if (err instanceof UploadConflict) {
        // Nothing was created. Show what the server needs the admin to decide.
        setMsg({ kind: "error", text: err.message });
        if (err.suggestion) setSuggestion({ ...err.suggestion, matches: err.suggestion.matches ?? [] });
        if (err.matches) setSuggestion((s) => (s ? { ...s, matches: err.matches! } : s));
      } else setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setSending(null);
    }
  };

  const canUpload =
    !!file && rights && sending === null && (target === "existing" ? !!existingId : !!effectiveName && (!needsConfirmation || confirmName) && (duplicates.length === 0 || createAnyway));

  return (
    <>
      <Card title="Upload a soundtrack (ZIP)">
        <p className="muted">
          Put the songs for one movie in a ZIP file (MP3, M4A, AAC or FLAC, up to 100 files and 300 MB). Each song is checked, analysed and saved as a hidden
          draft. Nothing is public until you review and publish it. Uploading the same ZIP again is safe: songs already saved are skipped.
        </p>
        <form ref={form} onSubmit={submit}>
          <label>
            ZIP file
            <input type="file" accept=".zip,application/zip" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="row" role="radiogroup" aria-label="Where do the songs go?">
            <label className="check">
              <input type="radio" checked={target === "new"} onChange={() => setTarget("new")} />
              <span>A new movie</span>
            </label>
            <label className="check">
              <input type="radio" checked={target === "existing"} onChange={() => setTarget("existing")} />
              <span>A movie that already exists</span>
            </label>
          </div>

          {target === "existing" ? (
            <label>
              Movie
              <select value={existingId} onChange={(e) => setExistingId(e.target.value)} required>
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
          ) : (
            <>
              <div className="grid">
                <label>
                  Movie name
                  <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Enter movie name or leave blank to use ZIP filename" maxLength={200} />
                </label>
                <label>
                  Language
                  <select name="language" defaultValue="">
                    <option value="">—</option>
                    {LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Release year (optional)
                  <input name="releaseYear" type="number" min="1900" max="2100" defaultValue={suggestion?.releaseYear ?? ""} key={suggestion?.releaseYear ?? "none"} />
                </label>
                <label>
                  Music director (optional)
                  <input name="musicDirector" />
                </label>
              </div>
              <label>
                Default description (optional)
                <textarea name="description" rows={2} />
              </label>

              {file && suggestion && !typedName.trim() && (
                <div className={`notice ${suggestion.ambiguous ? "warn" : ""}`}>
                  {suggestion.name ? (
                    <p>
                      Movie name taken from the file name: <b>{suggestion.name}</b>
                      {suggestion.releaseYear ? ` (${suggestion.releaseYear})` : ""}
                    </p>
                  ) : (
                    <p>The file name doesn't contain a movie name. Type it above.</p>
                  )}
                  {suggestion.ambiguous && (
                    <>
                      <p className="muted">{suggestion.reason} Type the real name above, or confirm this one.</p>
                      {suggestion.name && (
                        <label className="check">
                          <input type="checkbox" checked={confirmName} onChange={(e) => setConfirmName(e.target.checked)} />
                          <span>Yes, "{suggestion.name}" is the movie's name</span>
                        </label>
                      )}
                    </>
                  )}
                </div>
              )}

              {duplicates.length > 0 && (
                <div className="notice warn">
                  <p>
                    <b>A similar movie already exists.</b> Add the songs to it instead of creating a duplicate:
                  </p>
                  <ul className="items">
                    {duplicates.map((m) => (
                      <li key={m.id}>
                        <span className="name">{m.title}</span>
                        <span className="muted">{m.kind === "same" ? "same name" : "almost the same name"}</span>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => {
                            setTarget("existing");
                            setExistingId(String(m.id));
                          }}
                        >
                          Use this movie
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label className="check">
                    <input type="checkbox" checked={createAnyway} onChange={(e) => setCreateAnyway(e.target.checked)} />
                    <span>It's a different movie — create a separate one</span>
                  </label>
                </div>
              )}
            </>
          )}

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
            <button className="btn primary" disabled={!canUpload}>
              {sending !== null ? "Uploading…" : "Upload ZIP"}
            </button>
            {target === "new" && effectiveName && file && <span className="muted">Will create: {effectiveName}</span>}
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
