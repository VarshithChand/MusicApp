import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../api/hooks";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { Icon } from "../components/Icon";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";

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
