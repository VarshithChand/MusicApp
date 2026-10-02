import { useNavigate } from "react-router-dom";
import { Movie } from "../api/types";
import { Cover } from "./Cover";

/** A movie soundtrack as a poster card; opens its page with all its songs. */
export function MovieCard({ movie }: { movie: Movie }) {
  const navigate = useNavigate();
  const details = [movie.language, movie.release_year].filter(Boolean).join(" · ");
  return (
    <button className="card movie-card" onClick={() => navigate(`/movie/${movie.id}`)} aria-label={`Open ${movie.title}`}>
      <Cover id={movie.id} uri={movie.poster_url} size={148} radius={16} />
      <span className="song-title">{movie.title}</span>
      <span className="song-sub">{details || movie.artist_name}</span>
      <span className="song-sub">
        {movie.song_count} song{movie.song_count === 1 ? "" : "s"}
      </span>
    </button>
  );
}
