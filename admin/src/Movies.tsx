import { useEffect, useState } from "react";
import { AdminSong, api, Artist, Classification, LabelDef, Movie, mediaUrl } from "./api";
import { Card, Msg, fmt, useLoad, useSubmit } from "./ui";

const LANGUAGES = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "English", "Other"];
const KIND_TITLES: Record<LabelDef["kind"], string> = { style: "Style / energy", mood: "Mood", genre: "Genre" };
const REVIEW_TEXT: Record<Classification["review_status"], string> = {
  pending: "Suggestions waiting for approval",
  needs_review: "Needs manual review (low confidence)",
  approved: "Labels approved",
  rejected: "Suggestions rejected",
};
const METHOD_TEXT: Record<string, string> = {
  "audio-features": "Measured from the audio (tempo, loudness, beat) plus the title and movie",
  metadata: "Title and movie only — the audio could not be analysed",
  external: "External classifier service",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

// --- one song in the review list ------------------------------------------

interface EditorProps {
  song: AdminSong;
  labels: LabelDef[];
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onSaved: () => void;
}

function SongEditor({ song, labels, isFirst, isLast, onMove, onSaved }: EditorProps) {
  const [title, setTitle] = useState(song.title);
  const [singers, setSingers] = useState(song.singers ?? "");
  const [lyricist, setLyricist] = useState(song.lyricist ?? "");
  const [director, setDirector] = useState(song.music_director ?? "");
  const [language, setLanguage] = useState(song.language ?? "");
  const [description, setDescription] = useState(song.description ?? "");
  // Only APPROVED labels (source "manual") count as the song's labels; the first one is the main label.
  const [chosen, setChosen] = useState<string[]>(song.moods.filter((m) => m.source === "manual").map((m) => m.slug));
  const [downloadable, setDownloadable] = useState(song.downloadable);
  const wasSuggested = song.description_source === "suggested";
  const [suggested, setSuggested] = useState(wasSuggested);
  const [verified, setVerified] = useState(!wasSuggested);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const c = song.classification;
  const predicted = new Map((c?.labels ?? []).map((l) => [l.slug, l] as const));
  const nameOf = (slug: string) => labels.find((l) => l.slug === slug)?.name ?? slug;

  const toggleLabel = (slug: string) => setChosen((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug].slice(0, 6)));

  const useSuggestions = () => {
    setChosen((c?.labels ?? []).filter((l) => l.confidence >= 0.35).map((l) => l.slug).slice(0, 6));
    setSuggested(true);
    setVerified(false);
    setMsg({ kind: "ok", text: "Suggestions copied into the label list. Tick “I have checked…” and save to approve them." });
  };

  const run = async (action: () => Promise<unknown>, success: string, refresh = true) => {
    setBusy(true);
    setMsg(null);
    try {
      await action();
      setMsg({ kind: "ok", text: success });
      if (refresh) onSaved();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const askForDescription = () =>
    run(async () => {
      const s = await api.suggest(song.id);
      setDescription(s.description);
      setSuggested(true);
      setVerified(false);
    }, "Description filled in from the title, movie and details above (not from the audio). Edit it, then save.", false);

  const save = (status?: "draft" | "published") =>
    run(
      () => {
        // Labels the admin saves are APPROVED unless they came from a suggestion that has not been checked yet.
        const source = suggested && !verified ? "suggested" : "manual";
        return api.patchSong(song.id, {
          title: title.trim() || song.title,
          singers: singers.trim() || null,
          lyricist: lyricist.trim() || null,
          musicDirector: director.trim() || null,
          language: language.trim() || null,
          description: description.trim() || null,
          descriptionSource: source,
          moods: chosen.map((slug, i) => ({ slug, primary: i === 0, source, confidence: predicted.get(slug)?.confidence })),
          downloadable,
          ...(status ? { status } : {}),
        });
      },
      status === "published" ? "Published." : status === "draft" ? "Hidden from users." : "Saved.",
    );

  const remove = async () => {
    if (!confirm(`Delete "${song.title}" from this movie?`)) return;
    await api.deleteSong(song.id);
    onSaved();
  };

  return (
    <div className="song-edit">
      <div className="song-edit-head">
        <b>
          {song.track_number ?? "–"}. {song.title}
        </b>
        <span className={`badge ${song.status}`}>{song.status === "published" ? "Published" : "Draft"}</span>
        <span className="muted">
          {song.format?.toUpperCase()} · {fmt(song.duration)}
        </span>
        <span className="spacer" />
        <button className="btn small" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up">
          ↑
        </button>
        <button className="btn small" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down">
          ↓
        </button>
      </div>

      <audio controls preload="none" src={mediaUrl(song.audio_url)} />

      <div className="grid">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Singers
          <input value={singers} onChange={(e) => setSingers(e.target.value)} placeholder="Separate with commas" />
        </label>
        <label>
          Music director
          <input value={director} onChange={(e) => setDirector(e.target.value)} />
        </label>
        <label>
          Lyricist
          <input value={lyricist} onChange={(e) => setLyricist(e.target.value)} />
        </label>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Same as movie</option>
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Description {suggested && !verified && <span className="badge suggested">Suggested — not verified</span>}
        <textarea
          rows={2}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setSuggested(false);
          }}
        />
      </label>

      {/* What the classifier measured and suggested. Suggestions never reach search until they are approved. */}
      <div className={`classification ${c?.review_status ?? "none"}`}>
        <div className="row">
          <b>Classification</b>
          {c ? <span className={`badge ${c.review_status}`}>{REVIEW_TEXT[c.review_status]}</span> : <span className="badge">Not classified yet</span>}
        </div>
        {c && (
          <>
            <p className="muted small-text">
              {METHOD_TEXT[c.method] ?? c.method} · {c.model_version}. This is a rule-based analysis, not a trained model, so check it.
            </p>
            {c.error && <p className="msg error">{c.error}</p>}
            {c.features && (
              <p className="muted small-text">
                Measured: {c.features.tempoBpm ? `${c.features.tempoBpm} BPM` : "no steady tempo"} · loudness {c.features.rmsDb} dB · {c.features.onsetDensity} hits/s · beat strength{" "}
                {pct(c.features.beatStrength)}
              </p>
            )}
            {c.labels.length ? (
              <ul className="predictions">
                {c.labels.map((l) => (
                  <li key={l.slug} title={l.evidence.join("; ")}>
                    <span className="name">{nameOf(l.slug)}</span>
                    <span className="bar" aria-hidden="true">
                      <span style={{ width: pct(l.confidence) }} className={l.confidence < 0.55 ? "low" : ""} />
                    </span>
                    <span className="muted">{pct(l.confidence)}</span>
                    {l.confidence < 0.55 && <span className="badge needs_review">low</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No confident suggestion. Choose the labels yourself below.</p>
            )}
          </>
        )}
        <div className="actions">
          <button className="btn small" onClick={useSuggestions} disabled={busy || !c?.labels.length}>
            Use these suggestions
          </button>
          <button className="btn small" onClick={() => run(() => api.approveSong(song.id, { action: "approve" }), "Confident suggestions approved.")} disabled={busy || !c?.labels.length}>
            Approve suggestions
          </button>
          <button className="btn small" onClick={() => run(() => api.approveSong(song.id, { action: "reject" }), "Suggestions rejected.")} disabled={busy || !c}>
            Reject
          </button>
          <button className="btn small" onClick={() => run(() => api.classifySong(song.id), "Classification re-run. Approved labels were not changed.")} disabled={busy}>
            Re-run
          </button>
        </div>
      </div>

      {(["style", "mood", "genre"] as const).map((kind) => (
        <fieldset key={kind} className="moods">
          <legend>
            {KIND_TITLES[kind]}
            {kind === "style" && <span className="muted"> (first ticked label is the main one, up to 6 in total)</span>}
          </legend>
          {labels
            .filter((l) => l.kind === kind)
            .map((l) => {
              const p = predicted.get(l.slug);
              return (
                <label key={l.slug} className={`mood ${chosen.includes(l.slug) ? "on" : ""}`}>
                  <input type="checkbox" checked={chosen.includes(l.slug)} onChange={() => toggleLabel(l.slug)} />
                  {l.name}
                  {chosen[0] === l.slug && <span aria-label="main label"> ★</span>}
                  {p && !chosen.includes(l.slug) && <span className="muted"> · suggested {pct(p.confidence)}</span>}
                </label>
              );
            })}
        </fieldset>
      ))}

      <div className="row">
        <label className="check">
          <input type="checkbox" checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />
          <span>Let users download this song (only if you may share it)</span>
        </label>
      </div>
      {suggested && (
        <label className="check">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          <span>I have checked the suggested description and labels</span>
        </label>
      )}

      <div className="actions">
        <button className="btn" onClick={askForDescription} disabled={busy}>
          Suggest description
        </button>
        <button className="btn primary" onClick={() => save()} disabled={busy}>
          Save
        </button>
        {song.status === "draft" ? (
          <button className="btn" onClick={() => save("published")} disabled={busy}>
            Publish this song
          </button>
        ) : (
          <button className="btn" onClick={() => save("draft")} disabled={busy}>
            Unpublish
          </button>
        )}
        <button className="btn danger" onClick={remove} disabled={busy}>
          Delete
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}

// --- review a whole movie --------------------------------------------------

function Review({ movie, onChanged }: { movie: Movie; onChanged: () => void }) {
  const songs = useLoad(() => api.movieSongs(movie.id));
  const labels = useLoad(api.labels);
  const [order, setOrder] = useState<number[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Keep a local order of song ids; reset it whenever the list is reloaded from the server.
  useEffect(() => {
    if (songs.data) {
      setOrder(songs.data.map((s) => s.id));
      setOrderDirty(false);
    }
  }, [songs.data]);

  const byId = new Map((songs.data ?? []).map((s) => [s.id, s] as const));
  const ordered = order.map((id) => byId.get(id)).filter((s): s is AdminSong => !!s);

  const count = (status: Classification["review_status"] | "none") =>
    (songs.data ?? []).filter((s) => (s.classification?.review_status ?? "none") === status).length;

  const move = (index: number, direction: -1 | 1) => {
    const next = [...order];
    const j = index + direction;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setOrder(next);
    setOrderDirty(true);
  };

  const refreshAll = () => {
    songs.reload();
    onChanged();
  };

  const run = async (action: () => Promise<string>) => {
    setMsg(null);
    try {
      setMsg({ kind: "ok", text: await action() });
      refreshAll();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  };

  const approveAll = (includeLow: boolean) => {
    if (includeLow && !confirm("This also approves suggestions the classifier was NOT confident about. Continue?")) return;
    return run(async () => {
      const r = await api.approveMovieLabels(movie.id, includeLow);
      return `Approved ${r.labels} label${r.labels === 1 ? "" : "s"} on ${r.songs} song${r.songs === 1 ? "" : "s"}. ${includeLow ? "" : "Songs flagged for manual review were skipped."}`;
    });
  };

  const rerunAll = () =>
    run(async () => {
      const r = await api.classifyMovie(movie.id);
      // The server works through the songs one at a time; look again shortly.
      window.setTimeout(refreshAll, 5000);
      return `Re-running classification for ${r.queued} song${r.queued === 1 ? "" : "s"} in the background. Approved labels will not change.`;
    });

  return (
    <Card title={`Review: ${movie.title}`}>
      <p className="muted">
        Each song is analysed when it is uploaded. Check the suggested labels, correct them if needed, then publish. Nothing is visible to users until you publish, and
        search only uses labels you have approved.
      </p>
      {songs.data && songs.data.length > 0 && (
        <p className="summary">
          <span className="badge needs_review">{count("needs_review")} need review</span>
          <span className="badge pending">{count("pending")} waiting for approval</span>
          <span className="badge approved">{count("approved")} approved</span>
          {count("none") > 0 && <span className="badge">{count("none")} not classified</span>}
        </p>
      )}
      {songs.error && <span className="msg error">{songs.error}</span>}
      {songs.data?.length === 0 && <p className="muted">No songs yet. Upload a ZIP on the Uploads tab.</p>}

      {songs.data && songs.data.length > 0 && (
        <div className="actions bulk">
          <button className="btn" onClick={() => approveAll(false)}>
            Approve all confident suggestions
          </button>
          <button className="btn" onClick={() => approveAll(true)}>
            Approve everything, including low confidence
          </button>
          <button className="btn" onClick={rerunAll}>
            Re-run classification for all songs
          </button>
        </div>
      )}

      {ordered.map((s, i) => (
        <SongEditor
          key={s.id}
          song={s}
          labels={labels.data ?? []}
          isFirst={i === 0}
          isLast={i === ordered.length - 1}
          onMove={(d) => move(i, d)}
          onSaved={refreshAll}
        />
      ))}

      <div className="actions">
        {orderDirty && (
          <button
            className="btn"
            onClick={() =>
              run(async () => {
                await api.saveOrder(movie.id, order);
                return "Order saved.";
              })
            }
          >
            Save new order
          </button>
        )}
        {movie.status === "published" ? (
          <button
            className="btn"
            onClick={() =>
              run(async () => {
                await api.patchMovie(movie.id, { status: "draft" });
                return "Movie hidden from users.";
              })
            }
          >
            Unpublish movie
          </button>
        ) : null}
        <button
          className="btn primary"
          disabled={!songs.data?.length}
          onClick={() => {
            if (!confirm(`Publish "${movie.title}" and all its draft songs for everyone?`)) return;
            return run(async () => {
              const r = await api.publishMovie(movie.id);
              return `Published (${r.published} song${r.published === 1 ? "" : "s"} made public).`;
            });
          }}
        >
          {movie.status === "published" ? "Publish new drafts" : "Publish movie"}
        </button>
        <Msg msg={msg} />
      </div>
    </Card>
  );
}

// --- the Movies tab --------------------------------------------------------

export function MoviesTab({ onChange, selectedId, onSelect }: { onChange: () => void; selectedId: number | null; onSelect: (id: number | null) => void }) {
  const movies = useLoad(api.movies);
  const artists = useLoad(api.artists);
  const { busy, msg, submit } = useSubmit(api.createMovie, () => {
    movies.reload();
    onChange();
  });
  const selected = movies.data?.find((m) => m.id === selectedId) ?? null;

  return (
    <>
      <Card title="Add a movie">
        {artists.data?.length === 0 && <p className="muted">Create an artist first (Artists tab). It is used as the movie's main credit.</p>}
        <form onSubmit={submit}>
          <div className="grid">
            <label>
              Movie name
              <input name="title" required />
            </label>
            <label>
              Main artist / credit
              <select name="artistId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {artists.data?.map((a: Artist) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
              Release year
              <input name="releaseYear" type="number" min="1900" max="2100" />
            </label>
            <label>
              Music director
              <input name="musicDirector" />
            </label>
            <label>
              Poster / artwork (optional)
              <input name="cover" type="file" accept="image/*" />
            </label>
          </div>
          <label>
            Description
            <textarea name="description" rows={2} />
          </label>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add movie"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>

      <Card title={`Movies${movies.data ? ` (${movies.data.length})` : ""}`}>
        {movies.error && <span className="msg error">{movies.error}</span>}
        <div className="movie-list">
          {movies.data?.map((m) => (
            <div key={m.id} className={`movie-row ${m.id === selectedId ? "selected" : ""}`}>
              {m.poster_url ? <img src={mediaUrl(m.poster_url)} alt="" /> : <span className="poster-empty" aria-hidden="true" />}
              <div className="movie-info">
                <b>{m.title}</b>
                <span className="muted">{[m.language, m.release_year, m.music_director].filter(Boolean).join(" · ") || "No details yet"}</span>
                <span className="muted">
                  {m.published_songs} published · {m.draft_songs} draft
                </span>
              </div>
              <span className={`badge ${m.status}`}>{m.status === "published" ? "Published" : "Draft"}</span>
              <button className="btn" onClick={() => onSelect(m.id === selectedId ? null : m.id)}>
                {m.id === selectedId ? "Close" : "Review songs"}
              </button>
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Review
          key={selected.id}
          movie={selected}
          onChanged={() => {
            movies.reload();
            onChange();
          }}
        />
      )}
    </>
  );
}
