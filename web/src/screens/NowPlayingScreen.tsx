import { useNavigate } from "react-router-dom";
import { useLikedSongs, useToggleLike } from "../api/hooks";
import { Cover } from "../components/Cover";
import { Icon } from "../components/Icon";
import { useCurrentSong, usePlayer } from "../store/player";

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function NowPlayingScreen() {
  const navigate = useNavigate();
  const song = useCurrentSong();
  const p = usePlayer();
  const liked = useLikedSongs();
  const toggleLike = useToggleLike();
  const isLiked = !!song && !!liked.data?.some((s) => s.id === song.id);

  return (
    <div className="player-page">
      <header className="player-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Close player">
          <Icon name="chevronDown" size={26} />
        </button>
        <div className="center">
          <span className="kicker">NOW PLAYING</span>
          <span className="song-title">{song?.album_title ?? " "}</span>
        </div>
        <span className="icon-btn" />
      </header>

      {!song ? (
        <p className="muted center">Nothing playing. Pick a song from Home or Search.</p>
      ) : (
        <>
          <div className="art">
            <Cover id={song.id} uri={song.cover_url} size={320} radius={24} />
          </div>

          <div className="title-row">
            <div className="song-text">
              <h1>{song.title}</h1>
              <span className="song-sub big">{song.artist_name}</span>
            </div>
            <button
              className={`icon-btn ${isLiked ? "liked" : ""}`}
              aria-pressed={isLiked}
              aria-label={isLiked ? "Unlike song" : "Like song"}
              onClick={() => toggleLike.mutate({ songId: song.id, liked: isLiked })}
            >
              <Icon name="heart" size={28} filled={isLiked} />
            </button>
          </div>

          <div>
            <input
              className="range"
              type="range"
              min={0}
              max={p.duration || 1}
              step={1}
              value={Math.min(p.position, p.duration || 1)}
              onChange={(e) => p.seek(Number(e.target.value))}
              aria-label="Seek"
              style={{ ["--fill" as string]: `${p.duration > 0 ? (p.position / p.duration) * 100 : 0}%` }}
            />
            <div className="times">
              <span>{fmt(p.position)}</span>
              <span>{fmt(p.duration)}</span>
            </div>
          </div>

          <div className="controls">
            <button className="icon-btn muted-btn" onClick={p.shuffleUpNext} aria-label="Shuffle up next">
              <Icon name="shuffle" />
            </button>
            <button className="icon-btn" onClick={p.prev} aria-label="Previous song">
              <Icon name="prev" size={30} />
            </button>
            <button className="play-btn" onClick={p.toggle} aria-label={p.loading ? "Loading" : p.playing ? "Pause" : "Play"} aria-busy={p.loading}>
              {p.loading ? <span className="spinner big" aria-hidden="true" /> : <Icon name={p.playing ? "pause" : "play"} size={32} />}
            </button>
            <button className="icon-btn" onClick={p.next} aria-label="Next song">
              <Icon name="next" size={30} />
            </button>
            <button className={`icon-btn muted-btn ${p.repeat ? "on" : ""}`} onClick={p.toggleRepeat} aria-pressed={p.repeat} aria-label="Repeat">
              <Icon name="repeat" />
            </button>
          </div>

          <div className="volume">
            <Icon name="volume" size={20} />
            <input
              className="range"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              aria-label="Volume"
              style={{ ["--fill" as string]: `${p.volume * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
