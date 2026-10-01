import { useNavigate } from "react-router-dom";
import { useArtists, useRecentlyPlayed, useSongs } from "../api/hooks";
import { Cover } from "../components/Cover";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeScreen() {
  const navigate = useNavigate();
  const playQueue = usePlayer((s) => s.playQueue);
  const recent = useRecentlyPlayed();
  const popular = useSongs("popular");
  const artists = useArtists();

  return (
    <div className="page">
      <h1>{greeting()}</h1>

      {popular.isLoading && <p className="muted">Loading…</p>}
      {popular.isError && <p className="error">Couldn't load music. Check your connection.</p>}

      {!!recent.data?.length && (
        <section>
          <h2>Recently played</h2>
          <div className="hscroll">
            {recent.data.map((s, i) => (
              <button key={s.id} className="card" onClick={() => playQueue(recent.data, i)}>
                <Cover id={s.id} uri={s.cover_url} size={132} radius={16} />
                <span className="song-title">{s.title}</span>
                <span className="song-sub">{s.artist_name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!!popular.data?.length && (
        <section>
          <h2>Popular</h2>
          {popular.data.slice(0, 10).map((s, i) => (
            <SongRow key={s.id} song={s} onPlay={() => playQueue(popular.data, i)} />
          ))}
        </section>
      )}

      {!!artists.data?.length && (
        <section>
          <h2>Artists</h2>
          <div className="hscroll">
            {artists.data.map((a) => (
              <button
                key={a.id}
                className="card round"
                onClick={() => navigate(`/list?title=${encodeURIComponent(a.name)}&path=${encodeURIComponent(`/artists/${a.id}/songs`)}`)}
              >
                <Cover id={a.id} uri={a.image_url} size={96} radius={48} />
                <span className="song-title">{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
