import { useNavigate } from "react-router-dom";
import { useArtists, useRecentlyPlayed, useSongs } from "../api/hooks";
import { Cover } from "../components/Cover";
import { APK_URL, isAndroid } from "../config";
import { Icon } from "../components/Icon";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";
import { useSheet } from "../store/sheet";
import { useAuth } from "../store/auth";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function HomeScreen() {
  const navigate = useNavigate();
  const name = useAuth((s) => s.user?.name?.split(" ")[0]);
  const playQueue = usePlayer((s) => s.playQueue);
  const openSheet = useSheet((s) => s.open);
  const recent = useRecentlyPlayed();
  const popular = useSongs("popular");
  const artists = useArtists();

  const featured = popular.data?.[0];

  return (
    <div className="page wide">
      <header>
        <h1>
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </header>

      {isAndroid() && (
        <aside className="apk-banner">
          <div>
            <b>Get the Android app</b>
            <span className="muted">Listen in the background with lock-screen controls.</span>
          </div>
          <a className="btn primary" href={APK_URL}>
            <Icon name="download" size={18} /> Download
          </a>
        </aside>
      )}

      {popular.isLoading && <p className="muted">Loading…</p>}
      {popular.isError && <p className="error">Couldn't load music. Check your connection.</p>}

      {featured && popular.data && (
        <section className="feature" aria-label="Featured song">
          <Cover id={featured.id} uri={featured.cover_url} size={160} radius={20} />
          <div className="feature-body">
            <span className="kicker">MOST PLAYED</span>
            <h2 className="feature-title">{featured.title}</h2>
            <span className="song-sub big">
              {[featured.artist_name, featured.album_title].filter(Boolean).join(" · ")}
            </span>
            <div className="row feature-actions">
              <button className="btn primary" onClick={() => playQueue(popular.data, 0)}>
                <Icon name="play" size={20} /> Play
              </button>
              <button className="btn" onClick={() => openSheet(featured.id)}>
                <Icon name="plus" size={18} /> Add to playlist
              </button>
            </div>
          </div>
        </section>
      )}

      {!!recent.data?.length && (
        <section>
          <h2>Recently played</h2>
          <div className="hscroll">
            {recent.data.map((s, i) => (
              <button key={s.id} className="card" onClick={() => playQueue(recent.data, i)}>
                <span className="card-art">
                  <Cover id={s.id} uri={s.cover_url} size={148} radius={16} />
                  <span className="card-play" aria-hidden="true">
                    <Icon name="play" size={20} />
                  </span>
                </span>
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
          <div className="song-grid">
            {popular.data.slice(0, 12).map((s, i) => (
              <SongRow key={s.id} song={s} onPlay={() => playQueue(popular.data, i)} />
            ))}
          </div>
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
                <Cover id={a.id} uri={a.image_url} size={112} radius={56} />
                <span className="song-title">{a.name}</span>
                <span className="song-sub">Artist</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
