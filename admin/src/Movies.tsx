import { useEffect, useState } from "react";
import { AdminSong, api, Artist, MoodInfo, Movie, mediaUrl } from "./api";
import { Card, Msg, fmt, useLoad, useSubmit } from "./ui";

const LANGUAGES = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "English", "Other"];

// --- one song in the review list ------------------------------------------

interface EditorProps {
  song: AdminSong;
  moods: MoodInfo[];
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onSaved: () => void;
}

function SongEditor({ song, moods, isFirst, isLast, onMove, onSaved }: EditorProps) {
  const [title, setTitle] = useState(song.title);
  const [singers, setSingers] = useState(song.singers ?? "");
  const [lyricist, setLyricist] = useState(song.lyricist ?? "");
  const [director, setDirector] = useState(song.music_director ?? "");
  const [language, setLanguage] = useState(song.language ?? "");
  const [description, setDescription] = useState(song.description ?? "");
  const [chosen, setChosen] = useState<string[]>(song.moods.map((m) => m.slug)); // first = primary
  const [downloadable, setDownloadable] = useState(song.downloadable);
  // "Suggested" content stays flagged until the admin ticks "verified".
  const wasSuggested = song.description_source === "suggested" || song.moods.some((m) => m.source === "suggested");
  const [suggested, setSuggested] = useState(wasSuggested);
  const [verified, setVerified] = useState(!wasSuggested);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const toggleMood = (slug: string) => {
    setChosen((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : [...c, slug].slice(0, 6)));
    setSuggested(false);
  };

  const askForSuggestion = async () => {
    setMsg(null);
    try {
      const s = await api.suggest(song.id);
      setDescription(s.description);
      setChosen(s.moods.map((m) => m.slug));
      setSuggested(true);
      setVerified(false);
      setMsg({ kind: "ok", text: "Suggestion filled in. It is based only on the title, movie and details above, not on the audio. Edit it, then save." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  };

  const save = async (status?: "draft" | "published") => {
    setBusy(true);
    setMsg(null);
    const source = suggested && !verified ? "suggested" : "manual";
    try {
      await api.patchSong(song.id, {
        title: title.trim() || song.title,
        singers: singers.trim() || null,
        lyricist: lyricist.trim() || null,
        musicDirector: director.trim() || null,
        language: language.trim() || null,
        description: description.trim() || null,
        descriptionSource: source,
        moods: chosen.map((slug, i) => ({ slug, primary: i === 0, source })),
        downloadable,
        ...(status ? { status } : {}),
      });
      setMsg({ kind: "ok", text: status === "published" ? "Published." : status === "draft" ? "Hidden from users." : "Saved." });
      onSaved();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

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

      <fieldset className="moods">
        <legend>
          Moods <span className="muted">(first ticked is the main mood, up to 6)</span>
        </legend>
        {moods.map((m) => (
          <label key={m.slug} className={`mood ${chosen.includes(m.slug) ? "on" : ""}`}>
            <input type="checkbox" checked={chosen.includes(m.slug)} onChange={() => toggleMood(m.slug)} />
            {m.name}
            {chosen[0] === m.slug && <span aria-label="main mood"> ★</span>}
          </label>
        ))}
      </fieldset>

      <div className="row">
        <label className="check">
          <input type="checkbox" checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />
          <span>Let users download this song (only if you may share it)</span>
        </label>
      </div>
      {suggested && (
        <label className="check">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
          <span>I have checked the suggested description and moods</span>
        </label>
      )}

      <div className="actions">
        <button className="btn" onClick={askForSuggestion} disabled={busy}>
          Suggest description &amp; moods
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
  const moods = useLoad(api.moods);
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

  const saveOrder = async () => {
    try {
      await api.saveOrder(movie.id, order);
      setMsg({ kind: "ok", text: "Order saved." });
      refreshAll();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  };

  const publish = async () => {
    if (!confirm(`Publish "${movie.title}" and all its draft songs for everyone?`)) return;
    try {
      const r = await api.publishMovie(movie.id);
      setMsg({ kind: "ok", text: `Published (${r.published} song${r.published === 1 ? "" : "s"} made public).` });
      refreshAll();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    }
  };

  const unpublish = async () => {
    await api.patchMovie(movie.id, { status: "draft" });
    setMsg({ kind: "ok", text: "Movie hidden from users." });
    refreshAll();
  };

  return (
    <Card title={`Review: ${movie.title}`}>
      <p className="muted">
        Check each song, fix the details and moods, then publish. Nothing is visible to users until you publish. Suggested
        descriptions and moods are guesses from the titles — they are labelled until you confirm them.
      </p>
      {songs.error && <span className="msg error">{songs.error}</span>}
      {songs.data?.length === 0 && <p className="muted">No songs yet. Upload a ZIP on the Uploads tab.</p>}

      {ordered.map((s, i) => (
        <SongEditor
          key={s.id}
          song={s}
          moods={moods.data ?? []}
          isFirst={i === 0}
          isLast={i === ordered.length - 1}
          onMove={(d) => move(i, d)}
          onSaved={refreshAll}
        />
      ))}

      <div className="actions">
        {orderDirty && (
          <button className="btn" onClick={saveOrder}>
            Save new order
          </button>
        )}
        {movie.status === "published" ? (
          <button className="btn" onClick={unpublish}>
            Unpublish movie
          </button>
        ) : null}
        <button className="btn primary" onClick={publish} disabled={!songs.data?.length}>
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
                <span className="muted">
                  {[m.language, m.release_year, m.music_director].filter(Boolean).join(" · ") || "No details yet"}
                </span>
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

      {selected && <Review key={selected.id} movie={selected} onChanged={() => { movies.reload(); onChange(); }} />}
    </>
  );
}
