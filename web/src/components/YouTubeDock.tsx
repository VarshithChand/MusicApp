import { useEffect } from "react";
import { useToggleYouTubeFavorite, useYouTubeFavorites } from "../api/hooks";
import { useVideo, VideoViewMode } from "../store/video";
import { Icon } from "./Icon";

export function YouTubeDock() {
  const video = useVideo((s) => s.video);
  const mode = useVideo((s) => s.mode);
  const setMode = useVideo((s) => s.setMode);
  const close = useVideo((s) => s.close);

  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();

  // Press ESC to exit full screen or close
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

  if (!video) return null;

  const isFav = !!favorites.data?.some((f) => f.videoId === video.videoId);

  const toggleFavorite = () => {
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

  return (
    <>
      {/* Backdrop overlay for Full Screen mode */}
      {mode === "full" && <div className="yt-backdrop" onClick={() => setMode("half")} />}

      <aside className={`yt-dock mode-${mode}`} aria-label="YouTube video player">
        <div className="yt-dock-head">
          <div className="yt-dock-meta">
            <span className="yt-dock-badge">
              <Icon name="youtube" size={16} />
            </span>
            <div className="yt-dock-text">
              <span className="yt-dock-title" title={video.title}>
                {video.title}
              </span>
              {video.channel && <span className="yt-dock-channel">{video.channel}</span>}
            </div>
          </div>

          <div className="yt-dock-controls">
            {/* 3 View Mode Options */}
            <div className="yt-mode-selector" title="Switch video view mode">
              <button
                className={`yt-mode-btn ${mode === "popup" ? "active" : ""}`}
                onClick={() => setMode("popup")}
                title="Popup / Mini PiP Dock (Corner)"
                aria-label="Popup mode"
                aria-pressed={mode === "popup"}
              >
                <Icon name="popup" size={16} />
                <span className="yt-mode-label">Popup</span>
              </button>

              <button
                className={`yt-mode-btn ${mode === "half" ? "active" : ""}`}
                onClick={() => setMode("half")}
                title="Half Screen (Split / Theater view)"
                aria-label="Half screen mode"
                aria-pressed={mode === "half"}
              >
                <Icon name="halfScreen" size={16} />
                <span className="yt-mode-label">Half Screen</span>
              </button>

              <button
                className={`yt-mode-btn ${mode === "full" ? "active" : ""}`}
                onClick={() => setMode("full")}
                title="Full Screen (Maximized theater view)"
                aria-label="Full screen mode"
                aria-pressed={mode === "full"}
              >
                <Icon name="fullScreen" size={16} />
                <span className="yt-mode-label">Full Screen</span>
              </button>
            </div>

            {/* Favorite button */}
            <button
              className={`icon-btn yt-dock-fav ${isFav ? "liked" : ""}`}
              onClick={toggleFavorite}
              title={isFav ? "Remove from favorites" : "Save to favorites"}
              aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
            >
              <Icon name="heart" size={18} filled={isFav} />
            </button>

            {/* Close button */}
            <button className="icon-btn yt-dock-close" onClick={close} title="Close player" aria-label="Close player">
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div className="yt-dock-frame">
          <iframe
            key={video.videoId}
            src={`https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </aside>
    </>
  );
}
