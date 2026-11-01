import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  usePreferredLanguages,
  useToggleYouTubeFavorite,
  useTrending,
  useYouTube,
  useYouTubeFavorites,
  useYouTubeVideo,
} from "../api/hooks";
import { YouTubeResult } from "../api/types";
import { Icon } from "../components/Icon";
import { GENRES } from "../data/genres";
import { languageLabel } from "../data/languages";
import { TASTES } from "../data/tastes";
import { useAuth } from "../store/auth";
import { usePlayer } from "../store/player";
import { useVideo } from "../store/video";

export type SearchFilterType = "all" | "series" | "movies" | "songs";

const SEARCH_FILTERS: { key: SearchFilterType; label: string; suffix: string }[] = [
  { key: "all", label: "All", suffix: "" },
  { key: "series", label: "🎬 Web Series / Short Films", suffix: "short film web series" },
  { key: "movies", label: "🍿 Movies & Trailers", suffix: "movie trailer" },
  { key: "songs", label: "🎵 Music & Songs", suffix: "song" },
];

const VIDEO_ID_PATTERNS = [/[?&]v=([\w-]{11})/, /youtu\.be\/([\w-]{11})/, /\/shorts\/([\w-]{11})/];

function parseVideoId(input: string): string | null {
  const text = input.trim();
  for (const pattern of VIDEO_ID_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return m[1];
  }
  return /^[\w-]{11}$/.test(text) ? text : null;
}

const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const MOODS = ["Mass", "Class", "Riding", "Traveling", "Alone", "Sad", "Romantic", "Party"] as const;

export function YouTubeScreen() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial states from URL search params with local storage fallback
  const tabParam = searchParams.get("tab");
  const initialTab: "discover" | "favorites" | "recent" =
    tabParam === "favorites" || tabParam === "recent"
      ? tabParam
      : (localStorage.getItem("music_yt_last_tab") as "favorites" | "recent") || "discover";

  const initialQ = searchParams.get("q") ?? "";
  const initialFilter = (searchParams.get("filter") as SearchFilterType) || "all";

  const [text, setText] = useState(initialQ);
  const [lookupId, setLookupId] = useState<string | null>(parseVideoId(initialQ));
  const [searchTerm, setSearchTerm] = useState<string | null>(initialQ.length >= 2 ? initialQ : null);
  const [contentFilter, setContentFilter] = useState<SearchFilterType>(
    ["all", "series", "movies", "songs"].includes(initialFilter) ? initialFilter : "all"
  );
  const [activeMood, setActiveMood] = useState<string | null>(searchParams.get("mood") || null);
  const [tab, setTabState] = useState<"discover" | "favorites" | "recent">(initialTab);
  const [badLink, setBadLink] = useState(false);

  const user = useAuth((s) => s.user);
  const openVideo = useVideo((s) => s.open);
  const recent = useVideo((s) => s.recent);
  const pauseAudio = usePlayer((s) => s.pause);

  // Sync tab with URL and localStorage
  const setTab = (newTab: "discover" | "favorites" | "recent") => {
    setTabState(newTab);
    localStorage.setItem("music_yt_last_tab", newTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newTab === "discover") {
          next.delete("tab");
        } else {
          next.set("tab", newTab);
        }
        return next;
      },
      { replace: true }
    );
  };

  // Listen to browser navigation (back/forward or external link)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "favorites" || t === "recent" || t === "discover") {
      setTabState(t);
    }
    const qParam = searchParams.get("q");
    if (qParam !== null && qParam !== text) {
      setText(qParam);
      setSearchTerm(qParam.length >= 2 ? qParam : null);
    }
    const fParam = searchParams.get("filter") as SearchFilterType;
    if (fParam && ["all", "series", "movies", "songs"].includes(fParam)) {
      setContentFilter(fParam);
    }
  }, [searchParams]);

  // Set default mood from user tastes/genres on load if no search/mood is set
  useEffect(() => {
    if (!activeMood && !searchTerm && user) {
      const firstTaste = user.song_tastes?.[0];
      const firstGenre = user.genres?.[0];
      const def = firstTaste
        ? (TASTES.find((t) => t.key === firstTaste)?.label ?? null)
        : firstGenre
        ? (GENRES.find((g) => g.key === firstGenre)?.label ?? null)
        : null;
      if (def) setActiveMood(def);
    }
  }, [user, activeMood, searchTerm]);

  const { primary: accountLanguage } = usePreferredLanguages();
  const langName = languageLabel(accountLanguage);

  const isSearchActive = !!searchTerm && searchTerm.trim().length >= 2;
  const activeFilterSuffix = SEARCH_FILTERS.find((f) => f.key === contentFilter)?.suffix || "";

  // Combine query with category filter suffix (e.g. "Choosi Chudangane" + "short film web series")
  const query = isSearchActive
    ? activeFilterSuffix
      ? `${searchTerm.trim()} ${activeFilterSuffix}`
      : searchTerm.trim()
    : activeMood
    ? `${activeMood.toLowerCase()} songs`
    : null;

  const resultsLabel = isSearchActive
    ? contentFilter !== "all"
      ? `${searchTerm.trim()} (${SEARCH_FILTERS.find((f) => f.key === contentFilter)?.label})`
      : searchTerm.trim()
    : (activeMood ?? "");

  const queryMood = isSearchActive ? null : (activeMood?.toLowerCase() ?? null);
  const queryLang = isSearchActive ? undefined : accountLanguage;

  // Handle content filter change
  const handleFilterChange = (filter: SearchFilterType) => {
    setContentFilter(filter);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (filter === "all") {
          next.delete("filter");
        } else {
          next.set("filter", filter);
        }
        return next;
      },
      { replace: true }
    );
  };

  // Debounced search text
  useEffect(() => {
    const value = text.trim();
    const timer = setTimeout(() => {
      const id = parseVideoId(value);
      if (id) {
        setLookupId(id);
        setSearchTerm(null);
      } else {
        setLookupId(null);
        setSearchTerm(value.length >= 2 ? value : null);
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value.length >= 2) {
            next.set("q", value);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true }
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [text, setSearchParams]);

  const topHits = useYouTube(query ?? "", "relevance", queryLang, queryMood);
  const latestResults = useMemo(() => {
    const results = topHits.data?.results;
    if (!results?.length) return results;
    return [...results].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  }, [topHits.data?.results]);

  const popularTe = useTrending("popular", accountLanguage);
  const latestTe = useTrending("trending", accountLanguage);
  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();
  const video = useYouTubeVideo(lookupId);

  const handleManualSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = parseVideoId(text);
    if (id) {
      setBadLink(false);
      setLookupId(id);
      return;
    }
    setLookupId(null);
    if (text.trim().length < 2) {
      setBadLink(true);
      setSearchTerm(null);
      return;
    }
    setBadLink(false);
    setSearchTerm(text.trim());
  };

  const isFavorite = (id: string) => !!favorites.data?.some((v) => v.videoId === id);

  const toggleFavorite = (r: YouTubeResult) => {
    if (isFavorite(r.videoId)) {
      remove.mutate(r.videoId);
    } else {
      add.mutate({
        videoId: r.videoId,
        title: r.title,
        channel: r.channel || null,
        thumbnail: r.thumbnail || null,
      });
    }
  };

  const playVideo = (v: YouTubeResult, list?: YouTubeResult[]) => {
    pauseAudio();
    const queue = (list ?? []).map((item) => ({
      videoId: item.videoId,
      title: item.title,
      channel: item.channel,
      thumbnail: item.thumbnail ?? null,
      durationSeconds: item.durationSeconds ?? null,
    }));
    openVideo(
      {
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        thumbnail: v.thumbnail,
        durationSeconds: v.durationSeconds ?? null,
      },
      queue,
      "half"
    );
  };

  const renderVideoCards = (list?: YouTubeResult[], isLoading = false, emptyNote = "No videos found.") => {
    if (isLoading) {
      return (
        <div className="yt-grid skeleton-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="yt-card-skeleton" />
          ))}
        </div>
      );
    }

    if (!list || list.length === 0) {
      return <p className="muted empty-note">{emptyNote}</p>;
    }

    return (
      <div className="yt-grid">
        {list.map((v) => {
          const fav = isFavorite(v.videoId);
          const dur = formatDuration(v.durationSeconds);
          return (
            <div key={v.videoId} className="yt-card">
              <div className="yt-card-thumb-wrap" onClick={() => playVideo(v, list)}>
                {v.thumbnail ? (
                  <img src={v.thumbnail} alt={v.title} loading="lazy" className="yt-card-img" />
                ) : (
                  <div className="yt-card-empty" />
                )}
                {dur && <span className="yt-duration-badge">{dur}</span>}
                <button className="yt-play-overlay" aria-label={`Play ${v.title}`}>
                  <Icon name="play" size={24} />
                </button>
              </div>

              <div className="yt-card-body">
                <div className="yt-card-details" onClick={() => playVideo(v, list)}>
                  <h4 className="yt-card-title" title={v.title}>
                    {v.title}
                  </h4>
                  <p className="yt-card-channel">{v.channel}</p>
                </div>
                <button
                  className={`icon-btn yt-fav-btn ${fav ? "liked" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(v);
                  }}
                  title={fav ? "Remove from favorites" : "Save to favorites"}
                  aria-label={fav ? "Remove from favorites" : "Save to favorites"}
                >
                  <Icon name="heart" size={18} filled={fav} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const directVideo = video.data?.video;

  return (
    <div className="page wide yt-page">
      <header className="page-head yt-header">
        <div>
          <div className="yt-title-row">
            <span className="yt-logo-badge">
              <Icon name="youtube" size={24} />
            </span>
            <h1>YouTube Music</h1>
          </div>
          <p className="muted">
            Explore music videos, trending hits, and movie clips directly inside the player dock.
          </p>
        </div>

        {/* View mode toggle tabs */}
        <div className="yt-view-tabs">
          <button
            className={`yt-tab-btn ${tab === "discover" ? "active" : ""}`}
            onClick={() => setTab("discover")}
          >
            Discover
          </button>
          <button
            className={`yt-tab-btn ${tab === "favorites" ? "active" : ""}`}
            onClick={() => setTab("favorites")}
          >
            Favorites {favorites.data?.length ? `(${favorites.data.length})` : ""}
          </button>
          <button
            className={`yt-tab-btn ${tab === "recent" ? "active" : ""}`}
            onClick={() => setTab("recent")}
          >
            Recents {recent.length ? `(${recent.length})` : ""}
          </button>
        </div>
      </header>

      {/* Search Input Bar */}
      <form className="yt-searchbar" onSubmit={handleManualSearch}>
        <div className="yt-search-input-wrap">
          <Icon name="search" size={20} className="yt-search-icon" />
          <input
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setBadLink(false);
            }}
            placeholder="Search a song, movie name, or paste a YouTube URL / Video ID..."
            className="yt-search-input"
          />
          {text && (
            <button
              type="button"
              className="icon-btn yt-clear-btn"
              onClick={() => {
                setText("");
                setLookupId(null);
                setSearchTerm(null);
                setContentFilter("all");
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("q");
                    next.delete("filter");
                    return next;
                  },
                  { replace: true }
                );
              }}
              aria-label="Clear search"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <button type="submit" className="btn primary yt-submit-btn">
          Search
        </button>
      </form>

      {badLink && <p className="error">Please enter at least 2 characters or paste a valid YouTube video link.</p>}

      {/* Category / Content Filter chips when search is active */}
      {tab === "discover" && isSearchActive && (
        <div className="yt-filter-chips-bar" role="group" aria-label="Search content filters">
          {SEARCH_FILTERS.map((f) => {
            const on = contentFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                className={`chip yt-filter-chip ${on ? "active" : ""}`}
                onClick={() => handleFilterChange(f.key)}
                aria-pressed={on}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Mood filter chips when browse mode is active */}
      {tab === "discover" && !isSearchActive && (
        <div className="yt-moods-bar">
          <button
            className={`chip yt-mood-chip ${!activeMood ? "active" : ""}`}
            onClick={() => setActiveMood(null)}
            aria-pressed={!activeMood}
          >
            All moods
          </button>
          {MOODS.map((m) => {
            const on = activeMood === m;
            return (
              <button
                key={m}
                className={`chip yt-mood-chip ${on ? "active" : ""}`}
                onClick={() => setActiveMood(on ? null : m)}
                aria-pressed={on}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {/* Direct Video preview if URL/ID was entered */}
      {directVideo && (
        <div className="yt-direct-card">
          <div className="yt-direct-art" onClick={() => playVideo(directVideo)}>
            {directVideo.thumbnail ? (
              <img src={directVideo.thumbnail} alt={directVideo.title} />
            ) : (
              <div className="yt-card-empty" />
            )}
            <button className="yt-play-overlay large">
              <Icon name="play" size={32} />
            </button>
          </div>
          <div className="yt-direct-info">
            <span className="badge">Direct Result</span>
            <h2>{directVideo.title}</h2>
            <p className="muted">
              {directVideo.channel}
              {formatDuration(directVideo.durationSeconds) ? ` · ${formatDuration(directVideo.durationSeconds)}` : ""}
            </p>
            <div className="yt-direct-actions">
              <button className="btn primary" onClick={() => playVideo(directVideo)}>
                <Icon name="play" size={18} /> Play Now
              </button>
              <button
                className={`btn ghost ${isFavorite(directVideo.videoId) ? "liked" : ""}`}
                onClick={() => toggleFavorite(directVideo)}
              >
                <Icon name="heart" size={18} filled={isFavorite(directVideo.videoId)} />
                {isFavorite(directVideo.videoId) ? "Saved in Favorites" : "Save to Favorites"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Favorites */}
      {tab === "favorites" && (
        <section className="yt-section">
          <div className="section-header">
            <h2>Your Saved YouTube Videos</h2>
            <span className="muted">{favorites.data?.length ?? 0} saved</span>
          </div>
          {renderVideoCards(
            favorites.data?.map((f) => ({
              videoId: f.videoId,
              title: f.title,
              channel: f.channel ?? "YouTube",
              thumbnail: f.thumbnail ?? null,
            })),
            favorites.isLoading,
            "No YouTube videos saved yet. Click the heart icon on any video to save it here."
          )}
        </section>
      )}

      {/* Tab: Recents */}
      {tab === "recent" && (
        <section className="yt-section">
          <div className="section-header">
            <h2>Recently Played Videos</h2>
            <span className="muted">{recent.length} in history</span>
          </div>
          {renderVideoCards(
            recent.map((r) => ({
              videoId: r.videoId,
              title: r.title,
              channel: r.channel ?? "YouTube",
              thumbnail: r.thumbnail ?? null,
            })),
            false,
            "No recently played YouTube videos yet."
          )}
        </section>
      )}

      {/* Tab: Discover */}
      {tab === "discover" && (
        <>
          {query ? (
            <>
              <section className="yt-section">
                <div className="section-header">
                  <h2>Top hits for "{resultsLabel}"</h2>
                </div>
                {renderVideoCards(topHits.data?.results, topHits.isFetching)}
              </section>

              <section className="yt-section">
                <div className="section-header">
                  <h2>Latest for "{resultsLabel}"</h2>
                </div>
                {renderVideoCards(latestResults, topHits.isFetching)}
              </section>
            </>
          ) : (
            <>
              <section className="yt-section">
                <div className="section-header">
                  <h2>{popularTe.data?.note ? "Popular Music Videos" : `Popular ${langName} Hits`}</h2>
                  <span className="muted">Trending all-time</span>
                </div>
                {renderVideoCards(popularTe.data?.results, popularTe.isFetching)}
              </section>

              <section className="yt-section">
                <div className="section-header">
                  <h2>{latestTe.data?.note ? "Latest Music Videos" : `Latest ${langName} Releases`}</h2>
                  <span className="muted">Recent 30 days</span>
                </div>
                {renderVideoCards(latestTe.data?.results, latestTe.isFetching)}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
