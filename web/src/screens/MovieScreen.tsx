import { useNavigate, useParams } from "react-router-dom";
import { useMovie } from "../api/hooks";
import { Cover } from "../components/Cover";
import { Icon } from "../components/Icon";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export function MovieScreen() {
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const { data: movie, isLoading, isError } = useMovie(id);
  const playQueue = usePlayer((s) => s.playQueue);

  return (
    <div className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="back" size={26} />
        </button>
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {isError && <p className="error">This movie isn't available.</p>}

      {movie && (
        <>
          <section className="feature">
            <Cover id={movie.id} uri={movie.poster_url} size={160} radius={20} />
            <div className="feature-body">
              <span className="kicker">SOUNDTRACK</span>
              <h1>{movie.title}</h1>
              <span className="song-sub big">
                {[movie.language, movie.release_year, movie.music_director && `Music: ${movie.music_director}`].filter(Boolean).join(" · ")}
              </span>
              {movie.description && <p className="muted">{movie.description}</p>}
              <div className="row feature-actions">
                <button className="btn primary" disabled={!movie.songs.length} onClick={() => playQueue(movie.songs, 0)}>
                  <Icon name="play" size={20} /> Play all
                </button>
              </div>
            </div>
          </section>

          <section>
            <h2>
              {movie.songs.length} song{movie.songs.length === 1 ? "" : "s"}
            </h2>
            {movie.songs.map((s, i) => (
              <div key={s.id} className="movie-song">
                <SongRow
                  song={s}
                  subtitle={[s.singers || s.artist_name, fmt(s.duration)].filter(Boolean).join(" · ")}
                  onPlay={() => playQueue(movie.songs, i)}
                />
                {!!s.moods?.length && (
                  <div className="mood-tags" aria-label="Moods">
                    {s.moods.map((m) => (
                      <button key={m} className="tag" onClick={() => navigate(`/search?mood=${m}`)}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
