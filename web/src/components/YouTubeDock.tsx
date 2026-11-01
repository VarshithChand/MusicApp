import { useEffect, useMemo, useState } from "react";
import { usePreferredLanguages, useToggleYouTubeFavorite, useTrending, useYouTubeFavorites } from "../api/hooks";
import { useVideo } from "../store/video";
import { Icon } from "./Icon";

const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function YouTubeDock() {
  const video = useVideo((s) => s.video);
  const mode = useVideo((s) => s.mode);
  const setMode = useVideo((s) => s.setMode);
  const queue = useVideo((s) => s.queue);
  const playFromQueue = useVideo((s) => s.playFromQueue);
  const openVideo = useVideo((s) => s.open);
  const close = useVideo((s) => s.close);

  const { primary: accountLanguage } = usePreferredLanguages();
  const trending = useTrending("trending", accountLanguage);
  const popular = useTrending("popular", accountLanguage);

  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();

  const [descExpanded, setDescExpanded] = useState(false);

  // Keyboard shortcut: Escape exits full screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "full") {
          setMode("half");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, setMode]);

  // Lock body scroll while watch overlay is open so background cards never leak or scroll underneath
  useEffect(() => {
    if (video && (mode === "half" || mode === "full")) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [video, mode]);

  // Combined mix/up-next list: queue if provided, or trending songs as recommended mix
  const mixList = useMemo(() => {
    if (queue.length > 1) return queue;
    const recents = (popular.data?.results ?? []).concat(trending.data?.results ?? []);
    // Deduplicate
    const map = new Map<string, (typeof recents)[0]>();
    for (const item of recents) {
      if (item.videoId && !map.has(item.videoId)) {
        map.set(item.videoId, item);
      }
    }
    return Array.from(map.values()).map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channel: v.channel || "YouTube",
      thumbnail: v.thumbnail || null,
      durationSeconds: v.durationSeconds ?? null,
    }));
  }, [queue, popular.data?.results, trending.data?.results]);

  if (!video) return null;

  const isFav = !!favorites.data?.some((f) => f.videoId === video.videoId);

  const toggleFavorite = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isFav) {
      remove.mutate(video.videoId);
    } else {
      add.mutate({
        videoId: video.videoId,
        title: video.title,
        channel: video.channel ?? null,
        thumbnail: video.thumbnail ?? null,
      });
    }
  };

  const isMini = mode === "mini" || mode === "popup";
  const isFull = mode === "full";

  return (
    <>
      {/* 1. SLIM HORIZONTAL MINI-BAR (When Minimized - Replaces messy popup) */}
      {isMini && (
        <aside className="yt-mini-bar" onClick={() => setMode("half")} aria-label="YouTube mini player">
          <div className="yt-mini-bar-left">
            {video.thumbnail ? (
              <img src={video.thumbnail} alt={video.title} className="yt-mini-thumb" />
            ) : (
              <div className="yt-mini-thumb-empty" />
            )}
            <div className="yt-mini-meta">
              <span className="yt-mini-title" title={video.title}>
                {video.title}
              </span>
              <span className="yt-mini-channel">{video.channel || "YouTube Music"}</span>
            </div>
          </div>

          <div className="yt-mini-bar-right" onClick={(e) => e.stopPropagation()}>
            <button
              className={`icon-btn yt-action-btn ${isFav ? "liked" : ""}`}
              onClick={toggleFavorite}
              title={isFav ? "Remove from favorites" : "Save to favorites"}
              aria-label="Toggle favorite"
            >
              <Icon name="heart" size={18} filled={isFav} />
            </button>
            <button
              className="btn ghost yt-expand-btn"
              onClick={() => setMode("half")}
              title="Expand to YouTube watch view"
              aria-label="Expand player"
            >
              <Icon name="fullScreen" size={16} /> Expand
            </button>
            <button
              className="icon-btn yt-close-btn"
              onClick={close}
              title="Close player"
              aria-label="Close player"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* Hidden iframe keeps playing audio without resetting when minimized */}
          <div className="yt-hidden-frame">
            <iframe
              key={video.videoId}
              src={`https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0&playsinline=1`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        </aside>
      )}

      {/* 2. AUTHENTIC YOUTUBE SPLIT / THEATER WATCH VIEW & FULLSCREEN */}
      {!isMini && (
        <div className={`yt-watch-overlay ${isFull ? "mode-full" : "mode-half"}`}>
          <div className="yt-watch-container">
            {/* LEFT COLUMN: Large 16:9 Video Player + Title + Actions + Description */}
            <div className="yt-watch-left">
              <div className="yt-player-wrapper">
                <iframe
                  key={video.videoId}
                  src={`https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0&playsinline=1`}
                  title={video.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="yt-player-iframe"
                />
              </div>

              {/* Title & Metadata */}
              <div className="yt-video-info">
                <h1 className="yt-video-title">{video.title}</h1>

                <div className="yt-channel-and-actions">
                  <div className="yt-channel-card">
                    <div className="yt-channel-avatar">
                      {(video.channel || "YT").charAt(0).toUpperCase()}
                    </div>
                    <div className="yt-channel-text">
                      <span className="yt-channel-name">{video.channel || "Official Music Channel"}</span>
                      <span className="yt-channel-sub">YouTube Partner</span>
                    </div>
                  </div>

                  {/* Action Buttons Row */}
                  <div className="yt-actions-toolbar">
                    <button
                      className={`btn ${isFav ? "primary" : "ghost"} yt-fav-pill`}
                      onClick={toggleFavorite}
                      aria-label="Save video"
                    >
                      <Icon name="heart" size={18} filled={isFav} />
                      <span>{isFav ? "Saved" : "Save"}</span>
                    </button>

                    <button
                      className="btn ghost yt-mode-action-btn"
                      onClick={() => setMode(isFull ? "half" : "full")}
                      title={isFull ? "Exit Fullscreen" : "Fullscreen"}
                      aria-label={isFull ? "Exit Fullscreen" : "Fullscreen"}
                    >
                      <Icon name="fullScreen" size={18} />
                      <span className="hide-xs">{isFull ? "Exit Full" : "Full Screen"}</span>
                    </button>

                    <button
                      className="btn ghost yt-mode-action-btn"
                      onClick={() => setMode("mini")}
                      title="Minimize to slim bar"
                      aria-label="Minimize player"
                    >
                      <Icon name="chevronDown" size={18} />
                      <span className="hide-xs">Minimize</span>
                    </button>

                    <button
                      className="icon-btn yt-close-icon-btn"
                      onClick={close}
                      title="Close player"
                      aria-label="Close player"
                    >
                      <Icon name="close" size={20} />
                    </button>
                  </div>
                </div>

                {/* Description Snippet Box */}
                <div
                  className={`yt-desc-box ${descExpanded ? "expanded" : ""}`}
                  onClick={() => setDescExpanded(!descExpanded)}
                >
                  <div className="yt-desc-header">
                    <span className="badge">Music Video</span>
                    <span className="muted">Streamed via YouTube Player</span>
                  </div>
                  <p className="yt-desc-text">
                    Listening to <b>{video.title}</b> by <b>{video.channel || "Unknown"}</b>.
                    Click any song in the Up-Next playlist to play it seamlessly.
                  </p>
                  <button className="yt-desc-more-btn">
                    {descExpanded ? "Show less" : "...more"}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Up-Next / Mix Sidebar (Only shown in Half Screen mode) */}
            {!isFull && (
              <div className="yt-watch-right">
                <div className="yt-queue-panel">
                  <div className="yt-queue-header">
                    <div>
                      <h3 className="yt-queue-title">Mix — {video.title}</h3>
                      <p className="yt-queue-sub">
                        Mixes and recommendations you will love · {mixList.length} tracks
                      </p>
                    </div>
                  </div>

                  {/* Scrollable list of tracks */}
                  <div className="yt-queue-list">
                    {mixList.map((item, index) => {
                      const isActive = item.videoId === video.videoId;
                      const dur = formatDuration(item.durationSeconds);
                      return (
                        <div
                          key={`${item.videoId}-${index}`}
                          className={`yt-queue-card ${isActive ? "active" : ""}`}
                          onClick={() => {
                            if (queue.length) {
                              playFromQueue(index);
                            } else {
                              openVideo(item, mixList, "half");
                            }
                          }}
                        >
                          <div className="yt-queue-thumb-wrap">
                            {item.thumbnail ? (
                              <img src={item.thumbnail} alt={item.title} className="yt-queue-thumb" />
                            ) : (
                              <div className="yt-queue-thumb-empty" />
                            )}
                            {dur && <span className="yt-queue-dur">{dur}</span>}
                            {isActive && (
                              <div className="yt-queue-playing-overlay">
                                <Icon name="play" size={16} />
                              </div>
                            )}
                          </div>

                          <div className="yt-queue-info">
                            <span className="yt-queue-song-title" title={item.title}>
                              {item.title}
                            </span>
                            <span className="yt-queue-channel">{item.channel}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
