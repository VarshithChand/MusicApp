import { useSearchParams } from "react-router-dom";
import { useFilteredSongs, useMoods, useMovies } from "../api/hooks";
import { usePlayer } from "../store/player";
import { Chip } from "./Chip";
import { MovieCard } from "./MovieCard";
import { SongRow } from "./SongRow";

const LANGUAGES = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "English"];

/** Movies matching what the user typed (by movie name, music director or credited artist). */
export function MovieResults({ q }: { q: string }) {
  const movies = useMovies(q);
  if (!q.trim() || !movies.data?.length) return null;
  return (
    <section>
      <h2>Movies</h2>
      <div className="hscroll">
        {movies.data.map((m) => (
          <MovieCard key={m.id} movie={m} />
        ))}
      </div>
    </section>
  );
}

/** Mood and language filters. The chosen filters live in the page address so Home can link straight to them. */
export function MoodBrowser({ q }: { q: string }) {
  const [params, setParams] = useSearchParams();
  const mood = params.get("mood") ?? "";
  const language = params.get("language") ?? "";
  const moods = useMoods();
  const songs = useFilteredSongs({ mood, language, q });
  const playQueue = usePlayer((s) => s.playQueue);

  const set = (key: "mood" | "language", value: string) => {
    const next = new URLSearchParams(params);
    if (!value || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const available = (moods.data ?? []).filter((m) => m.song_count > 0);
  if (!available.length && !mood && !language) return null;

  return (
    <section className="mood-browser">
      <h2>Browse by mood</h2>
      <div className="chips" role="group" aria-label="Mood">
        {available.map((m) => (
          <Chip key={m.slug} label={m.name} active={mood === m.slug} onClick={() => set("mood", m.slug)} />
        ))}
      </div>
      <div className="chips" role="group" aria-label="Language">
        {LANGUAGES.map((l) => (
          <Chip key={l} label={l} active={language.toLowerCase() === l.toLowerCase()} onClick={() => set("language", l)} />
        ))}
      </div>

      {(mood || language) && (
        <div>
          {songs.isFetching && <p className="muted">Loading…</p>}
          {songs.data && !songs.data.length && <p className="muted">No songs match these filters yet.</p>}
          {songs.data?.map((s, i) => (
            <SongRow
              key={s.id}
              song={s}
              subtitle={[s.singers || s.artist_name, s.album_title].filter(Boolean).join(" · ")}
              onPlay={() => playQueue(songs.data!, i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
