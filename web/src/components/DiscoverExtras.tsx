import { useSearchParams } from "react-router-dom";
import { useFilteredSongs, useMoods, useMovies } from "../api/hooks";
import { MoodCount } from "../api/types";
import { usePlayer } from "../store/player";
import { Chip } from "./Chip";
import { MovieCard } from "./MovieCard";
import { ScrollRow } from "./ScrollRow";
import { SongRow } from "./SongRow";

const LANGUAGES = ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam", "English"];
const KIND_TITLES: Record<MoodCount["kind"], string> = { style: "Style", mood: "Mood", genre: "Genre" };

/** Movies matching what the user typed (by movie name, music director or credited artist). */
export function MovieResults({ q }: { q: string }) {
  const movies = useMovies(q);
  if (!q.trim() || !movies.data?.length) return null;
  return (
    <section>
      <h2>Movies</h2>
      <ScrollRow label="Movies">
        {movies.data.map((m) => (
          <MovieCard key={m.id} movie={m} />
        ))}
      </ScrollRow>
    </section>
  );
}

/**
 * Label and language filters. Several labels can be chosen; a song must have ALL of them ("Melody + Romantic").
 * Only labels an admin has approved are searchable. The choice lives in the page address (?labels=a,b&language=Telugu),
 * so Home can link straight to a filtered list.
 */
export function MoodBrowser({ q }: { q: string }) {
  const [params, setParams] = useSearchParams();
  // "mood" is the older single-label parameter and still works.
  const chosen = [...(params.get("labels") ?? "").split(","), params.get("mood") ?? ""].map((s) => s.trim()).filter(Boolean);
  const language = params.get("language") ?? "";
  const moods = useMoods();
  const songs = useFilteredSongs({ labels: chosen, language, q });
  const playQueue = usePlayer((s) => s.playQueue);

  const toggleLabel = (slug: string) => {
    const next = new URLSearchParams(params);
    next.delete("mood");
    const labels = chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug];
    if (labels.length) next.set("labels", labels.join(","));
    else next.delete("labels");
    setParams(next, { replace: true });
  };
  const toggleLanguage = (value: string) => {
    const next = new URLSearchParams(params);
    if (next.get("language")?.toLowerCase() === value.toLowerCase()) next.delete("language");
    else next.set("language", value);
    setParams(next, { replace: true });
  };

  const available = (moods.data ?? []).filter((m) => m.song_count > 0);
  if (!available.length && !chosen.length && !language) return null;

  return (
    <section className="mood-browser">
      <h2>Browse by label</h2>
      {(["style", "mood", "genre"] as const).map((kind) => {
        const labels = available.filter((m) => m.kind === kind);
        if (!labels.length) return null;
        return (
          <div key={kind} className="label-group">
            <span className="label-kind">{KIND_TITLES[kind]}</span>
            <div className="chips" role="group" aria-label={KIND_TITLES[kind]}>
              {labels.map((m) => (
                <Chip key={m.slug} label={m.name} active={chosen.includes(m.slug)} onClick={() => toggleLabel(m.slug)} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="label-group">
        <span className="label-kind">Language</span>
        <div className="chips" role="group" aria-label="Language">
          {LANGUAGES.map((l) => (
            <Chip key={l} label={l} active={language.toLowerCase() === l.toLowerCase()} onClick={() => toggleLanguage(l)} />
          ))}
        </div>
      </div>

      {(chosen.length > 0 || language) && (
        <div>
          {chosen.length > 1 && <p className="muted small">Songs with all of the selected labels.</p>}
          {songs.isFetching && <p className="muted">Loading…</p>}
          {songs.data && !songs.data.length && <p className="muted">No songs match these filters yet. Try removing one.</p>}
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
