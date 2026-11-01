import { useEffect, useMemo, useRef, useState } from "react";
import { usePreferredLanguages, useToggleYouTubeFavorite, useTrending, useYouTubeFavorites } from "../api/hooks";
import { useVideo } from "../store/video";
import { Icon } from "./Icon";

const formatDuration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return null;
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
};

export function YouTubeDock() {
  const video = useVideo((s) => s.video);
  const mode = useVideo((s) => s.mode);
  const setMode = useVideo((s) => s.setMode);
  const queue = useVideo((s) => s.queue);
  const playFromQueue = useVideo((s) => s.playFromQueue);
  const openVideo = useVideo((s) => s.open);
  const close = useVideo((s) => s.close);
  const skip = useVideo((s) => s.skip);

  const { primary: accountLanguage } = usePreferredLanguages();
  const trending = useTrending("trending", accountLanguage);
  const popular = useTrending("popular", accountLanguage);

  const favorites = useYouTubeFavorites();
  const { add, remove } = useToggleYouTubeFavorite();

  const [descExpanded, setDescExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Combined mix/up-next list: queue if provided, or trending/popular songs as recommended mix
  const mixList = useMemo(() => {
    if (queue.length > 1) return queue;
    const recents = (popular.data?.results ?? []).concat(trending.data?.results ?? []);
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

  // Reset playback timing when video changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(video?.durationSeconds ?? 0);
    setIsPlaying(true);
  }, [video?.videoId, video?.durationSeconds]);

  // Lock body scroll ONLY while watch view is actively open in half/full screen (not minimized)
  useEffect(() => {
    if (video && mode !== "mini" && mode !== "popup") {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [video, mode]);

  // Send postMessage commands to YouTube embed iframe
  const sendCommand = (func: string, args: any[] = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func,
          args,
        }),
        "*"
      );
    } catch (_) {}
  };

  // Skip relative in seconds (-10s / +10s)
  const seekRelative = (delta: number) => {
    const nextTime = Math.max(0, currentTime + delta);
    setCurrentTime(nextTime);
    sendCommand("seekTo", [nextTime, true]);
  };

  // Play / Pause toggle
  const handleTogglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isPlaying) {
      sendCommand("pauseVideo");
      setIsPlaying(false);
    } else {
      sendCommand("playVideo");
      setIsPlaying(true);
    }
  };

  // Previous video: restart if > 5s into song, else navigate to previous track
  const handlePrevVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentTime > 5) {
      sendCommand("seekTo", [0, true]);
      setCurrentTime(0);
    } else {
      skip(-1, mixList);
    }
  };

  // Next video
  const handleNextVideo = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    skip(1, mixList);
  };

  // Listen to YouTube Player postMessage notifications for timing and auto-advance
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data) return;

        if (data.event === "infoDelivery" && data.info) {
          if (typeof data.info.currentTime === "number") {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === "number" && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === "number") {
            if (data.info.playerState === 1) setIsPlaying(true);
            if (data.info.playerState === 2) setIsPlaying(false);
            // 0 = YT.PlayerState.ENDED -> auto advance to next video
            if (data.info.playerState === 0) {
              skip(1, mixList);
            }
          }
        }

        if (data.event === "onStateChange") {
          if (data.info === 1) setIsPlaying(true);
          if (data.info === 2) setIsPlaying(false);
          if (data.info === 0) {
            skip(1, mixList);
          }
        }
      } catch (_) {}
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [mixList, skip]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "Escape") {
        if (mode === "full") {
          setMode("half");
        }
        return;
      }

      if (video) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          seekRelative(-10);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          seekRelative(10);
        } else if (e.key === " " || e.key.toLowerCase() === "k") {
          e.preventDefault();
          handleTogglePlay();
        } else if ((e.key === "N" && e.shiftKey) || e.key.toLowerCase() === "n") {
          e.preventDefault();
          handleNextVideo();
        } else if ((e.key === "P" && e.shiftKey) || e.key.toLowerCase() === "p") {
          e.preventDefault();
          handlePrevVideo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, setMode, video, currentTime, isPlaying, mixList]);

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
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      {/* 1. SLIM HORIZONTAL MINI-BAR (When Minimized) */}
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

          {/* Mini-Bar Center Transport Controls */}
          <div className="yt-mini-bar-center" onClick={(e) => e.stopPropagation()}>
            <button
              className="icon-btn yt-mini-ctrl-btn"
              onClick={handlePrevVideo}
              title="Previous video (P)"
              aria-label="Previous video"
            >
              <Icon name="prev" size={18} />
            </button>
            <button
              className="play-btn tiny yt-mini-play-btn"
              onClick={handleTogglePlay}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <Icon name={isPlaying ? "pause" : "play"} size={16} />
            </button>
            <button
              className="icon-btn yt-mini-ctrl-btn"
              onClick={handleNextVideo}
              title="Next video (N)"
              aria-label="Next video"
            >
              <Icon name="next" size={18} />
            </button>
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
        </aside>
      )}

      {/* 2. AUTHENTIC YOUTUBE SPLIT / THEATER WATCH VIEW & FULLSCREEN */}
      <div className={`yt-watch-overlay ${isFull ? "mode-full" : "mode-half"} ${isMini ? "is-minimized" : ""}`}>
        <div className="yt-watch-container">
          {/* LEFT COLUMN: 16:9 Video Player + Transport Controls + Title + Actions + Description */}
          <div className="yt-watch-left">
            <div className="yt-player-wrapper">
              <iframe
                ref={iframeRef}
                key={video.videoId}
                src={`https://www.youtube.com/embed/${encodeURIComponent(video.videoId)}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(origin)}&rel=0&playsinline=1`}
                title={video.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="yt-player-iframe"
                onLoad={() => {
                  iframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: "listening" }),
                    "*"
                  );
                }}
              />
            </div>

            {/* Transport Control Strip: Prev, -10s Rewind, Play/Pause, +10s Fast-Forward, Next */}
            <div className="yt-transport-bar">
              <div className="yt-transport-left">
                <button
                  className="icon-btn yt-transport-btn"
                  onClick={handlePrevVideo}
                  title="Previous video (Shift+P)"
                  aria-label="Previous video"
                >
                  <Icon name="prev" size={20} />
                </button>
                <button
                  className="btn ghost yt-transport-btn yt-skip-btn"
                  onClick={() => seekRelative(-10)}
                  title="Rewind 10 seconds (←)"
                  aria-label="Rewind 10 seconds"
                >
                  <Icon name="rewind" size={18} />
                  <span>-10s</span>
                </button>
                <button
                  className="play-btn small yt-play-btn"
                  onClick={handleTogglePlay}
                  title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  <Icon name={isPlaying ? "pause" : "play"} size={20} />
                </button>
                <button
                  className="btn ghost yt-transport-btn yt-skip-btn"
                  onClick={() => seekRelative(10)}
                  title="Fast forward 10 seconds (→)"
                  aria-label="Fast forward 10 seconds"
                >
                  <span>+10s</span>
                  <Icon name="fastForward" size={18} />
                </button>
                <button
                  className="icon-btn yt-transport-btn"
                  onClick={handleNextVideo}
                  title="Next video (Shift+N)"
                  aria-label="Next video"
                >
                  <Icon name="next" size={20} />
                </button>
              </div>

              <div className="yt-transport-time">
                <span>{formatDuration(currentTime) || "0:00"}</span>
                <span className="muted">/</span>
                <span className="muted">
                  {formatDuration(duration || video.durationSeconds) || "--:--"}
                </span>
              </div>
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

          {/* RIGHT COLUMN: Up-Next / Mix Sidebar (Shown in Half Screen mode) */}
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
    </>
  );
}
