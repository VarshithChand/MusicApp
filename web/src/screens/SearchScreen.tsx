import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDiscover, useImportSong, useSearch, useYouTube } from "../api/hooks";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { MoodBrowser, MovieResults } from "../components/DiscoverExtras";
import { Icon } from "../components/Icon";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";
import { useVideo } from "../store/video";

type Kind = "songs" | "artists" | "albums" | "genres";
const KINDS: { key: Kind; label: string }[] = [
  { key: "songs", label: "Songs" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "genres", label: "Genres" },
];

const listLink = (title: string, path: string) =>
  `/list?title=${encodeURIComponent(title)}&path=${encodeURIComponent(path)}`;

export function SearchScreen() {
  const navigate = useNavigate();
  const playQueue = usePlayer((s) => s.playQueue);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("songs");
  const { data, isFetching, isError } = useSearch(q);
  const discover = useDiscover(q);
  const youtube = useYouTube(q);
  const pausePlayer = usePlayer((s) => s.pause);
  const openVideo = useVideo((s) => s.open);
  const importSong = useImportSong();
  const [importingId, setImportingId] = useState<string | null>(null);

  // Adds the catalogue song to our library, then plays it. The audio is copied into our storage in the background.
  const playFromWeb = async (externalId: string) => {
    setImportingId(externalId);
    try {
      const song = await importSong.mutateAsync(externalId);
      playQueue([song], 0);
    } finally {
      setImportingId(null);
    }
  };

  // Wait for a pause in typing before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const empty = !!q && !isFetching && data && !data[kind].length;

  return (
    <div className="page">
      <h1>Search</h1>

      <div className="searchbox">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Songs, artists, albums"
          aria-label="Search songs, artists, albums or genres"
          autoFocus
        />
      </div>

      <div className="chips" role="group" aria-label="Result type">
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} active={kind === k.key} onClick={() => setKind(k.key)} />
        ))}
      </div>

      <MovieResults q={q} />
      <MoodBrowser q={q} />

      {isFetching && <p className="muted">Searching…</p>}
      {isError && <p className="error">Search failed. Check your connection.</p>}
      {!q && <p className="muted">Find songs, artists, albums and genres.</p>}
      {empty && (
        <p className="muted">
          No {kind} found for “{q}”.
        </p>
      )}

      {data && kind === "songs" &&
        data.songs.map((s, i) => (
          <SongRow
            key={s.id}
            song={s}
            subtitle={[s.artist_name, s.album_title].filter(Boolean).join(" · ")}
            onPlay={() => playQueue(data.songs, i)}
          />
        ))}

      {kind === "songs" && !!q && discover.data?.configured && (
        <section className="web-results">
          <h2>From the web</h2>
          <p className="muted small">Free, Creative Commons music. Tap a song to listen — it's also saved to your library.</p>
          {discover.isFetching && <p className="muted">Searching the web…</p>}
          {discover.isError && <p className="error">The web catalogue is unavailable right now.</p>}
          {discover.data.results.length === 0 && !discover.isFetching && <p className="muted">No free songs found on the web.</p>}
          {importSong.isError && <p className="error">Couldn't add that song. Try another.</p>}
          {discover.data.results.map((t) => (
            <div key={t.externalId} className="song-row">
              <button className="song-main" onClick={() => playFromWeb(t.externalId)} disabled={importingId !== null} aria-label={`Play ${t.title}`}>
                <span className="cover-wrap">
                  <Cover id={Number(t.externalId)} uri={t.cover} size={52} radius={12} />
                  {importingId === t.externalId && (
                    <span className="cover-loading" role="status" aria-label="Loading">
                      <span className="spinner" />
                    </span>
                  )}
                </span>
                <span className="song-text">
                  <span className="song-title">{t.title}</span>
                  <span className="song-sub">{[t.artist, t.album].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
              {t.licenseUrl && (
                <a className="license" href={t.licenseUrl} target="_blank" rel="noreferrer" title="Creative Commons licence">
                  CC
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      {kind === "songs" && !!q && youtube.data?.configured && (
        <section className="web-results">
          <h2>On YouTube</h2>
          <p className="muted small">Plays in YouTube's own player. Nothing is saved to your library.</p>
          {youtube.isFetching && <p className="muted">Searching YouTube…</p>}
          {youtube.isError && <p className="error">YouTube search is unavailable right now.</p>}
          {youtube.data.results.length === 0 && !youtube.isFetching && <p className="muted">No videos found.</p>}
          {youtube.data.results.map((v) => (
            <button
              key={v.videoId}
              className="list-row"
              onClick={() => {
                pausePlayer();
                openVideo({ videoId: v.videoId, title: v.title });
              }}
              aria-label={`Play ${v.title} on YouTube`}
            >
              {v.thumbnail ? <img className="yt-thumb" src={v.thumbnail} alt="" /> : <span className="yt-thumb" />}
              <span className="song-text">
                <span className="song-title">{v.title}</span>
                <span className="song-sub">{v.channel}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {data && kind === "artists" &&
        data.artists.map((a) => (
          <button key={a.id} className="list-row" onClick={() => navigate(listLink(a.name, `/artists/${a.id}/songs`))}>
            <Cover id={a.id} uri={a.image_url} size={52} radius={26} />
            <span className="song-title">{a.name}</span>
          </button>
        ))}

      {data && kind === "albums" &&
        data.albums.map((al) => (
          <button key={al.id} className="list-row" onClick={() => navigate(listLink(al.title, `/albums/${al.id}/songs`))}>
            <Cover id={al.id} uri={al.cover_url} size={52} radius={12} />
            <span className="song-text">
              <span className="song-title">{al.title}</span>
              <span className="song-sub">{al.artist_name}</span>
            </span>
          </button>
        ))}

      {data && kind === "genres" &&
        data.genres.map((g) => (
          <button
            key={g.id}
            className="list-row"
            onClick={() => {
              setText(g.name);
              setKind("songs");
            }}
          >
            <span className="song-title">{g.name}</span>
          </button>
        ))}
    </div>
  );
}
