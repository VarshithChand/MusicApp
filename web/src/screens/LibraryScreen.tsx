import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlbums, useArtists, useLikedSongs, usePlaylistMutations, usePlaylists } from "../api/hooks";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { Icon } from "../components/Icon";
import { NameModal } from "../components/NameModal";

type Tab = "playlists" | "albums" | "artists";

function listLink(title: string, path: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ title, path, ...extra });
  return `/list?${params.toString()}`;
}

export function LibraryScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("playlists");
  const [creating, setCreating] = useState(false);
  const playlists = usePlaylists();
  const liked = useLikedSongs();
  const albums = useAlbums();
  const artists = useArtists();
  const { create } = usePlaylistMutations();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Your library</h1>
        <button className="icon-btn filled" onClick={() => setCreating(true)} aria-label="New playlist">
          <Icon name="plus" size={22} />
        </button>
      </div>

      <div className="chips" role="group" aria-label="Library section">
        <Chip label="Playlists" active={tab === "playlists"} onClick={() => setTab("playlists")} />
        <Chip label="Albums" active={tab === "albums"} onClick={() => setTab("albums")} />
        <Chip label="Artists" active={tab === "artists"} onClick={() => setTab("artists")} />
      </div>

      {tab === "playlists" && (
        <div>
          <button className="list-row big" onClick={() => navigate(listLink("Liked songs", "/users/me/liked-songs", { kind: "liked" }))}>
            <span className="tile accent big">
              <Icon name="heart" size={26} filled />
            </span>
            <span className="song-text">
              <span className="song-title">Liked songs</span>
              <span className="song-sub">{liked.data ? `${liked.data.length} songs` : "Playlist"}</span>
            </span>
          </button>
          {playlists.isLoading && <p className="muted">Loading…</p>}
          {playlists.data?.map((p) => (
            <button
              key={p.id}
              className="list-row big"
              onClick={() => navigate(listLink(p.name, `/playlists/${p.id}`, { kind: "playlist", id: String(p.id) }))}
            >
              <Cover id={p.id} size={60} radius={14} />
              <span className="song-text">
                <span className="song-title">{p.name}</span>
                <span className="song-sub">{p.song_count} songs</span>
              </span>
            </button>
          ))}
          {playlists.isSuccess && !playlists.data.length && <p className="muted">No playlists yet. Use + to create one.</p>}
        </div>
      )}

      {tab === "albums" && (
        <div>
          {albums.isLoading && <p className="muted">Loading…</p>}
          {albums.data?.map((a) => (
            <button key={a.id} className="list-row big" onClick={() => navigate(listLink(a.title, `/albums/${a.id}/songs`))}>
              <Cover id={a.id} uri={a.cover_url} size={60} radius={14} />
              <span className="song-text">
                <span className="song-title">{a.title}</span>
                <span className="song-sub">{a.artist_name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === "artists" && (
        <div>
          {artists.isLoading && <p className="muted">Loading…</p>}
          {artists.data?.map((a) => (
            <button key={a.id} className="list-row big" onClick={() => navigate(listLink(a.name, `/artists/${a.id}/songs`))}>
              <Cover id={a.id} uri={a.image_url} size={60} radius={30} />
              <span className="song-text">
                <span className="song-title">{a.name}</span>
                <span className="song-sub">Artist</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <NameModal
          title="New playlist"
          confirmLabel="Create"
          onConfirm={(name) => create.mutate(name, { onSuccess: () => setCreating(false) })}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
