import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDiscover, useImportSong, useSearch, useYouTube } from "../api/hooks";
import { Chip } from "../components/Chip";
import { Cover } from "../components/Cover";
import { MoodBrowser, MovieResults } from "../components/DiscoverExtras";
import { Icon } from "../components/Icon";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";
import { useSearchHistory } from "../store/searchHistory";
import { useSearchSource } from "../store/searchSource";
import { useVideo } from "../store/video";

type Kind = "songs" | "artists" | "albums" | "genres";
const KINDS: { key: Kind; label: string }[] = [
  { key: "songs", label: "Songs" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "genres", label: "Genres" },
];

const MOODS = ["Mass", "Class", "Riding", "Traveling", "Alone", "Sad"];

const TRENDING_SEARCHES = [
  "Choosi Chudangane",
  "Anirudh Ravichander",
  "Devara",
  "Pushpa 2",
  "S. Thaman",
  "Mass Hits",
  "Romantic Melodies",
  "Devi Sri Prasad",
];

const listLink = (title: string, path: string) =>
  `/list?title=${encodeURIComponent(title)}&path=${encodeURIComponent(path)}`;

export function SearchScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const initialKind = (searchParams.get("kind") as Kind) || "songs";
  const initialMood = searchParams.get("mood") || null;

  const playQueue = usePlayer((s) => s.playQueue);
  const { history, add: addHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();
  const source = useSearchSource((s) => s.source);
  const setSource = useSearchSource((s) => s.setSource);

  const [text, setText] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [kind, setKindState] = useState<Kind>(
    ["songs", "artists", "albums", "genres"].includes(initialKind) ? initialKind : "songs"
  );
  const [mood, setMoodState] = useState<string | null>(initialMood);

  const setKind = (newKind: Kind) => {
    setKindState(newKind);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newKind === "songs") {
          next.delete("kind");
        } else {
          next.set("kind", newKind);
        }
        return next;
      },
      { replace: true }
    );
  };

  const setMood = (newMood: string | null) => {
    setMoodState(newMood);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!newMood) {
          next.delete("mood");
        } else {
          next.set("mood", newMood);
        }
        return next;
      },
      { replace: true }
    );
  };

  // Trigger a search query directly (e.g. from history or trending chip)
  const executeSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    setText(trimmed);
    setQ(trimmed);
    addHistory(trimmed);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("q", trimmed);
        return next;
      },
      { replace: true }
    );
  };

  // Return to Search History Landing view
  const clearSearch = () => {
    setText("");
    setQ("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        return next;
      },
      { replace: true }
    );
  };

  const { data, isFetching, isError } = useSearch(source === "web" ? q : "");
  const discover = useDiscover(source === "web" ? q : "");
  const youtubeQuery = q
    ? ["telugu", mood?.toLowerCase(), q].filter(Boolean).join(" ")
    : mood
      ? `telugu ${mood.toLowerCase()} songs`
      : "";
  const youtube = useYouTube(youtubeQuery);
  const pausePlayer = usePlayer((s) => s.pause);
  const openVideo = useVideo((s) => s.open);
  const importSong = useImportSong();
  const [importingId, setImportingId] = useState<string | null>(null);

  // Adds the catalogue song to our library, then plays it
  const playFromWeb = async (externalId: string) => {
    setImportingId(externalId);
    try {
      const song = await importSong.mutateAsync(externalId);
      playQueue([song], 0);
    } finally {
      setImportingId(null);
    }
  };

  // Debounce typing to search & save to history
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = text.trim();
      setQ(trimmed);
      if (trimmed.length >= 2) {
        addHistory(trimmed);
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (trimmed) {
            next.set("q", trimmed);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true }
      );
    }, 350);
    return () => clearTimeout(t);
  }, [text, setSearchParams, addHistory]);

  const isSearchActive = !!q && q.trim().length > 0;
  const empty = isSearchActive && !isFetching && data && !data[kind].length;

  return (
    <div className="page search-page">
      {/* Search Header */}
      <div className="page-head">
        <div className="row">
          {isSearchActive ? (
            <button className="icon-btn" onClick={clearSearch} aria-label="Back to search history" title="Back to search history">
              <Icon name="back" size={24} />
            </button>
          ) : (
            <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back" title="Back">
              <Icon name="back" size={24} />
            </button>
          )}
          <h1>{isSearchActive ? `Results for "${q}"` : "Search"}</h1>
        </div>
      </div>

      {/* Persistent Search Box */}
      <div className="searchbox">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Songs, artists, movies, albums..."
          aria-label="Search songs, artists, albums or genres"
          autoFocus={!isSearchActive}
        />
        {text && (
          <button className="icon-btn search-clear-btn" onClick={clearSearch} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* =========================================================================
          PAGE 1: SEARCH HISTORY & DISCOVERY LANDING VIEW (Shown by default when no search active)
          ========================================================================= */}
      {!isSearchActive && (
        <div className="search-history-container">
          {/* Recent Searches Section */}
          <section className="search-history-section">
            <div className="search-section-header">
              <h2>Recent Searches</h2>
              {history.length > 0 && (
                <button className="btn-text danger-text" onClick={clearHistory}>
                  Clear all
                </button>
              )}
            </div>

            {history.length > 0 ? (
              <div className="search-history-list">
                {history.map((item) => (
                  <div key={item} className="search-history-row">
                    <button className="search-history-item" onClick={() => executeSearch(item)}>
                      <span className="search-history-icon">
                        <Icon name="history" size={18} />
                      </span>
                      <span className="search-history-text">{item}</span>
                    </button>
                    <button
                      className="icon-btn search-remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistory(item);
                      }}
                      title="Remove from history"
                      aria-label={`Remove ${item} from history`}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-history-empty">
                <span className="search-empty-icon">
                  <Icon name="history" size={32} />
                </span>
                <p>No recent searches yet</p>
                <span className="muted small">Your search queries will appear here for fast access.</span>
              </div>
            )}
          </section>

          {/* Trending Searches Section */}
          <section className="search-history-section">
            <div className="search-section-header">
              <h2>Trending & Popular</h2>
            </div>
            <div className="search-tags-wrap">
              {TRENDING_SEARCHES.map((tag) => (
                <button key={tag} className="chip search-tag-chip" onClick={() => executeSearch(tag)}>
                  <Icon name="search" size={14} />
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Quick Moods & Discover Section */}
          <section className="search-history-section">
            <div className="search-section-header">
              <h2>Browse Moods</h2>
            </div>
            <MoodBrowser q="" />
          </section>
        </div>
      )}

      {/* =========================================================================
          PAGE 2: SEARCH RESULTS RESPONSE VIEW (Dedicated results page when query is active)
          ========================================================================= */}
      {isSearchActive && (
        <div className="search-results-container">
          {/* =========================================================================
              SOURCE 1: YOUTUBE DIRECT RESULTS (When YouTube is selected)
              ========================================================================= */}
          {source === "youtube" && (
            <section className="search-youtube-direct-section">
              <div className="search-section-header">
                <h2>YouTube Results</h2>
                <span className="badge">YouTube Mode</span>
              </div>
              <p className="muted small">Direct video search. Plays in YouTube's built-in player.</p>

              {youtube.isFetching && <p className="muted">Searching YouTube…</p>}
              {youtube.isError && <p className="error">YouTube search is unavailable right now.</p>}
              {youtube.data?.results.length === 0 && !youtube.isFetching && (
                <div className="search-history-empty">
                  <span className="search-empty-icon">
                    <Icon name="youtube" size={32} />
                  </span>
                  <p>No videos found for "{q}"</p>
                  <span className="muted small">Try searching another title or artist name.</span>
                </div>
              )}

              {youtube.data?.results.map((v) => (
                <button
                  key={v.videoId}
                  className="list-row yt-search-row"
                  onClick={() => {
                    pausePlayer();
                    openVideo(
                      { videoId: v.videoId, title: v.title, channel: v.channel, thumbnail: v.thumbnail },
                      youtube.data?.results.map((item) => ({
                        videoId: item.videoId,
                        title: item.title,
                        channel: item.channel,
                        thumbnail: item.thumbnail,
                        durationSeconds: item.durationSeconds ?? null,
                      })),
                      "half"
                    );
                  }}
                  aria-label={`Play ${v.title} on YouTube`}
                >
                  {v.thumbnail ? <img className="yt-thumb" src={v.thumbnail} alt="" /> : <span className="yt-thumb" />}
                  <span className="song-text">
                    <span className="song-title">{v.title}</span>
                    <span className="song-sub">{v.channel}</span>
                  </span>
                  <span className="row-action-icon" aria-hidden="true">
                    <Icon name="play" size={18} />
                  </span>
                </button>
              ))}
            </section>
          )}

          {/* =========================================================================
              SOURCE 2: SEARCH FROM WEB RESULTS (When Search from Web is selected)
              ========================================================================= */}
          {source === "web" && (
            <>
              {/* Result Type Tabs */}
              <div className="chips" role="group" aria-label="Result type">
                {KINDS.map((k) => (
                  <Chip key={k.key} label={k.label} active={kind === k.key} onClick={() => setKind(k.key)} />
                ))}
              </div>

              {/* Mood Filters for Songs */}
              {kind === "songs" && (
                <div className="chips" role="group" aria-label="Mood">
                  {MOODS.map((m) => (
                    <Chip key={m} label={m} active={mood === m} onClick={() => setMood(mood === m ? null : m)} />
                  ))}
                </div>
              )}

              {/* Movies Result Grid */}
              <MovieResults q={q} />

              {/* Status Indicators */}
              {isFetching && <p className="muted">Searching…</p>}
              {isError && <p className="error">Search failed. Check your connection.</p>}
              {empty && (
                <p className="muted">
                  No {kind} found for “{q}”. Try another search term.
                </p>
              )}

              {/* Songs Results List */}
              {data && kind === "songs" &&
                data.songs.map((s, i) => (
                  <SongRow
                    key={s.id}
                    song={s}
                    subtitle={[s.artist_name, s.album_title].filter(Boolean).join(" · ")}
                    onPlay={() => playQueue(data.songs, i)}
                  />
                ))}

              {/* Creative Commons Web Catalogue */}
              {kind === "songs" && !!q && discover.data?.configured && (
                <section className="web-results">
                  <h2>From the web</h2>
                  <p className="muted small">Free, Creative Commons music. Tap a song to listen — it's also saved to your library.</p>
                  {discover.isFetching && <p className="muted">Searching the web…</p>}
                  {discover.isError && <p className="error">The web catalogue is unavailable right now.</p>}
                  {discover.data.results.length === 0 && !discover.isFetching && <p className="muted">No free songs found on the web.</p>}
                  {importSong.isError && <p className="error">Couldn't add that song. Try another.</p>}
                  {discover.data.results.map((t) => (
                    <div key={t.externalId} className="song-row">
                      <button className="song-main" onClick={() => playFromWeb(t.externalId)} disabled={importingId !== null} aria-label={`Play ${t.title}`}>
                        <span className="cover-wrap">
                          <Cover id={Number(t.externalId)} uri={t.cover} size={52} radius={12} />
                          {importingId === t.externalId && (
                            <span className="cover-loading" role="status" aria-label="Loading">
                              <span className="spinner" />
                            </span>
                          )}
                        </span>
                        <span className="song-text">
                          <span className="song-title">{t.title}</span>
                          <span className="song-sub">{[t.artist, t.album].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                      {t.licenseUrl && (
                        <a className="license" href={t.licenseUrl} target="_blank" rel="noreferrer" title="Creative Commons licence">
                          CC
                        </a>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Artists Results */}
              {data && kind === "artists" &&
                data.artists.map((a) => (
                  <button key={a.id} className="list-row" onClick={() => navigate(listLink(a.name, `/artists/${a.id}/songs`))}>
                    <Cover id={a.id} uri={a.image_url} size={52} radius={26} />
                    <span className="song-title">{a.name}</span>
                  </button>
                ))}

              {/* Albums Results */}
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

              {/* Genres Results */}
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
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          PERSISTENT 2-OPTION SELECTOR (AT BOTTOM): 1. YouTube  2. Search from Web
          ========================================================================= */}
      <div className="source-bar-wrap">
        <div className="source-segmented-bar" role="group" aria-label="Default search source">
          <button
            type="button"
            className={`source-segment-btn ${source === "youtube" ? "active" : ""}`}
            onClick={() => setSource("youtube")}
            aria-pressed={source === "youtube"}
          >
            <Icon name="youtube" size={17} />
            <span>YouTube</span>
          </button>
          <button
            type="button"
            className={`source-segment-btn ${source === "web" ? "active" : ""}`}
            onClick={() => setSource("web")}
            aria-pressed={source === "web"}
          >
            <Icon name="search" size={17} />
            <span>Search from Web</span>
          </button>
        </div>
      </div>
    </div>
  );
}
