import { useNavigate } from "react-router-dom";
import { useArtists, useMoods, useMovies, useRecentlyPlayed, useSongs, useTrending } from "../api/hooks";
import { YouTubeResult } from "../api/types";
import { Cover } from "../components/Cover";
import { DownloadApp } from "../components/DownloadApp";
import { Icon } from "../components/Icon";
import { MovieCard } from "../components/MovieCard";
import { ScrollRow } from "../components/ScrollRow";
import { SongRow } from "../components/SongRow";
import { isAndroid } from "../config";
import { useAuth } from "../store/auth";
import { usePlayer } from "../store/player";
import { useSheet } from "../store/sheet";
import { useVideo } from "../store/video";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** A row of music videos that play in YouTube's own player (docked in the corner). Nothing is saved or downloaded. */
function VideoRow({ title, note, label, videos }: { title: string; note: string; label: string; videos: YouTubeResult[] }) {
  const openVideo = useVideo((s) => s.open);
  const pausePlayer = usePlayer((s) => s.pause);
  return (
    <section>
      <h2>{title}</h2>
      <p className="muted section-note">{note}</p>
      <ScrollRow label={label}>
        {videos.map((v) => (
          <button
            key={v.videoId}
            className="card yt-card"
            role="listitem"
            onClick={() => {
              pausePlayer();
              openVideo({ videoId: v.videoId, title: v.title });
            }}
            aria-label={`Play ${v.title} on YouTube`}
          >
            <span className="card-art">
              {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" /> : <span className="yt-card-empty" />}
              <span className="card-play" aria-hidden="true">
                <Icon name="play" size={20} />
              </span>
            </span>
            <span className="song-title">{v.title}</span>
            <span className="song-sub">{v.channel}</span>
          </button>
        ))}
      </ScrollRow>
    </section>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const name = useAuth((s) => s.user?.name?.split(" ")[0]);
  const playQueue = usePlayer((s) => s.playQueue);
  const openSheet = useSheet((s) => s.open);
  const recent = useRecentlyPlayed();
  const popular = useSongs("popular");
  const artists = useArtists();
  const movies = useMovies();
  const moods = useMoods();
  const trendingTelugu = useTrending("trending", "te");
  const popularTelugu = useTrending("popular", "te");

  const featured = popular.data?.[0];

  return (
    <div className="page wide">
      <header className="page-head">
        <h1>
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
        <button className="icon-btn filled" onClick={() => navigate("/account")} aria-label="Account">
          <Icon name="user" size={22} />
        </button>
      </header>

      {isAndroid() && (
        <aside className="apk-banner">
          <div>
            <b>Get the Android app</b>
            <span className="muted">Listen in the background with lock-screen controls.</span>
          </div>
          <DownloadApp className="btn primary">
            <Icon name="download" size={18} /> Download
          </DownloadApp>
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
            <span className="song-sub big">{[featured.artist_name, featured.album_title].filter(Boolean).join(" · ")}</span>
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

      {!!trendingTelugu.data?.results.length && (
        <VideoRow
          title="Trending Telugu songs"
          note="The most watched Telugu music videos of the last 30 days. Plays in YouTube's own player."
          label="Trending Telugu songs"
          videos={trendingTelugu.data.results}
        />
      )}

      {!!popularTelugu.data?.results.length && (
        <VideoRow
          title="Popular Telugu songs"
          note="The most watched Telugu music videos of all time. Plays in YouTube's own player."
          label="Popular Telugu songs"
          videos={popularTelugu.data.results}
        />
      )}

      {!!recent.data?.length && (
        <section>
          <h2>Recently played</h2>
          <ScrollRow label="Recently played">
            {recent.data.map((s, i) => (
              <button key={s.id} className="card" role="listitem" onClick={() => playQueue(recent.data, i)}>
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
          </ScrollRow>
        </section>
      )}

      {!!movies.data?.length && (
        <section>
          <h2>New soundtracks</h2>
          <ScrollRow label="New soundtracks">
            {movies.data.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </ScrollRow>
        </section>
      )}

      {!!moods.data?.some((m) => m.song_count > 0) && (
        <section>
          <h2>Browse by mood</h2>
          <div className="chips">
            {moods.data
              .filter((m) => m.song_count > 0)
              .map((m) => (
                <button key={m.slug} className="chip" onClick={() => navigate(`/search?labels=${m.slug}`)}>
                  {m.name}
                </button>
              ))}
          </div>
        </section>
      )}

      {!!popular.data?.length && (
        <section>
          <h2>Popular in your library</h2>
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
          <ScrollRow label="Artists">
            {artists.data.map((a) => (
              <button
                key={a.id}
                className="card round"
                role="listitem"
                onClick={() => navigate(`/list?title=${encodeURIComponent(a.name)}&path=${encodeURIComponent(`/artists/${a.id}/songs`)}`)}
              >
                <Cover id={a.id} uri={a.image_url} size={112} radius={56} />
                <span className="song-title">{a.name}</span>
                <span className="song-sub">Artist</span>
              </button>
            ))}
          </ScrollRow>
        </section>
      )}
    </div>
  );
}
