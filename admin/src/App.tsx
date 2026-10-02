import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { Album, api, Artist, Genre, isSignedIn, login, mediaUrl, signOut, Song, Stats } from "./api";
import { PasswordInput } from "./PasswordInput";
import { MoviesTab } from "./Movies";
import { Card, fmt, Msg, useLoad, useSubmit } from "./ui";
import { UploadsTab } from "./Uploads";

type Tab = "movies" | "uploads" | "songs" | "artists" | "albums" | "genres";
const TABS: { key: Tab; label: string }[] = [
  { key: "movies", label: "Movies" },
  { key: "uploads", label: "Uploads" },
  { key: "songs", label: "Songs" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "genres", label: "Genres" },
];


// --- login ---------------------------------------------------------------

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(fd.get("email")), String(fd.get("password")));
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <h1>Music admin</h1>
      <p className="muted">Log in with an admin account.</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <PasswordInput name="password" autoComplete="current-password" />
        </label>
        {error && (
          <span className="msg error" role="alert">
            {error}
          </span>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

// --- songs ---------------------------------------------------------------

function SongsTab({ onChange }: { onChange: () => void }) {
  const songs = useLoad(api.songs);
  const artists = useLoad(api.artists);
  const albums = useLoad(api.albums);
  const genres = useLoad(api.genres);
  const [duration, setDuration] = useState("");

  const { busy, msg, submit } = useSubmit(api.createSong, () => {
    setDuration("");
    songs.reload();
    onChange();
  });

  // Fill in the length automatically from the chosen audio file.
  const readDuration = (file?: File) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) setDuration(String(Math.round(audio.duration)));
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => URL.revokeObjectURL(url);
  };

  const toggleDownload = async (s: Song) => {
    await api.setDownloadable(s.id, !s.downloadable);
    songs.reload();
  };

  const remove = async (s: Song) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    await api.deleteSong(s.id);
    songs.reload();
    onChange();
  };

  return (
    <>
      <Card title="Add a song">
        {artists.data?.length === 0 && <p className="muted">Create an artist first (Artists tab).</p>}
        <form onSubmit={submit}>
          <div className="grid">
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Artist
              <select name="artistId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {artists.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Album (optional)
              <select name="albumId" defaultValue="">
                <option value="">None</option>
                {albums.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} — {a.artist_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Genre (optional)
              <select name="genreId" defaultValue="">
                <option value="">None</option>
                {genres.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Audio file (MP3)
              <input name="audio" type="file" accept="audio/*" required onChange={(e) => readDuration(e.target.files?.[0])} />
            </label>
            <label>
              Cover image (optional)
              <input name="cover" type="file" accept="image/*" />
            </label>
            <label className="check">
              <input name="downloadable" type="checkbox" value="true" />
              <span>Let users download this song (only if you own it or are allowed to share it)</span>
            </label>
            <label>
              Length in seconds
              <input name="duration" type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Uploading…" : "Add song"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>

      <Card title={`Songs${songs.data ? ` (${songs.data.length})` : ""}`}>
        {songs.error && <span className="msg error">{songs.error}</span>}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Artist</th>
                <th>Album</th>
                <th>Genre</th>
                <th>Length</th>
                <th>Download</th>
                <th>Preview</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {songs.data?.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.artist_name}</td>
                  <td>{s.album_title ?? "—"}</td>
                  <td>{s.genre_name ?? "—"}</td>
                  <td>{fmt(s.duration)}</td>
                  <td>
                    <button className="btn" onClick={() => toggleDownload(s)} aria-pressed={s.downloadable}>
                      {s.downloadable ? "On" : "Off"}
                    </button>
                  </td>
                  <td>
                    <audio controls preload="none" src={mediaUrl(s.audio_url)} />
                  </td>
                  <td>
                    <button className="btn danger" onClick={() => remove(s)}>
                      Delete
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

// --- artists / albums / genres -------------------------------------------

function ArtistsTab({ onChange }: { onChange: () => void }) {
  const artists = useLoad(api.artists);
  const { busy, msg, submit } = useSubmit(api.createArtist, () => {
    artists.reload();
    onChange();
  });
  return (
    <>
      <Card title="Add an artist">
        <form onSubmit={submit}>
          <div className="grid">
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Image (optional)
              <input name="image" type="file" accept="image/*" />
            </label>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add artist"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>
      <Card title={`Artists${artists.data ? ` (${artists.data.length})` : ""}`}>
        {artists.error && <span className="msg error">{artists.error}</span>}
        <ul>
          {artists.data?.map((a: Artist) => (
            <li key={a.id}>{a.name}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function AlbumsTab({ onChange }: { onChange: () => void }) {
  const albums = useLoad(api.albums);
  const artists = useLoad(api.artists);
  const { busy, msg, submit } = useSubmit(api.createAlbum, () => {
    albums.reload();
    onChange();
  });
  return (
    <>
      <Card title="Add an album">
        <form onSubmit={submit}>
          <div className="grid">
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Artist
              <select name="artistId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {artists.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cover (optional)
              <input name="cover" type="file" accept="image/*" />
            </label>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add album"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>
      <Card title={`Albums${albums.data ? ` (${albums.data.length})` : ""}`}>
        {albums.error && <span className="msg error">{albums.error}</span>}
        <ul>
          {albums.data?.map((a: Album) => (
            <li key={a.id}>
              {a.title} <span className="muted">— {a.artist_name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function GenresTab() {
  const genres = useLoad(api.genres);
  const { busy, msg, submit } = useSubmit((fd) => api.createGenre(String(fd.get("name"))), genres.reload);
  return (
    <>
      <Card title="Add a genre">
        <form onSubmit={submit}>
          <div className="grid">
            <label>
              Name
              <input name="name" required />
            </label>
          </div>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Add genre"}
            </button>
            <Msg msg={msg} />
          </div>
        </form>
      </Card>
      <Card title={`Genres${genres.data ? ` (${genres.data.length})` : ""}`}>
        {genres.error && <span className="msg error">{genres.error}</span>}
        <ul>
          {genres.data?.map((g: Genre) => (
            <li key={g.id}>{g.name}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// --- shell ---------------------------------------------------------------

function Panel({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<Tab>("movies");
  const [reviewMovie, setReviewMovie] = useState<number | null>(null);
  const stats = useLoad<Stats>(api.stats);

  return (
    <div className="shell">
      <header className="top">
        <h1>Music admin</h1>
        <button
          className="btn"
          onClick={() => {
            signOut();
            onSignOut();
          }}
        >
          Log out
        </button>
      </header>

      {stats.error && <p className="msg error">{stats.error}</p>}
      {stats.data && (
        <div className="stats">
          {Object.entries(stats.data).map(([k, v]) => (
            <div className="stat" key={k}>
              <b>{v}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className="tab" onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "movies" && <MoviesTab onChange={stats.reload} selectedId={reviewMovie} onSelect={setReviewMovie} />}
      {tab === "uploads" && (
        <UploadsTab
          onReview={(id) => {
            setReviewMovie(id);
            setTab("movies");
          }}
        />
      )}
      {tab === "songs" && <SongsTab onChange={stats.reload} />}
      {tab === "artists" && <ArtistsTab onChange={stats.reload} />}
      {tab === "albums" && <AlbumsTab onChange={stats.reload} />}
      {tab === "genres" && <GenresTab />}
    </div>
  );
}

export default function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  return signedIn ? <Panel onSignOut={() => setSignedIn(false)} /> : <Login onDone={() => setSignedIn(true)} />;
}
