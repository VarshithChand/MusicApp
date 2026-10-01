import { useVideo } from "../store/video";
import { Icon } from "./Icon";

/**
 * Plays a video in YouTube's own embedded player, docked in the corner so it never covers the page and keeps
 * playing while you move between screens. YouTube requires the player to stay visible (at least 200x200 px)
 * and unmodified, so it can be closed but not hidden. Nothing is downloaded or stored.
 */
export function YouTubeDock() {
  const video = useVideo((s) => s.video);
  const close = useVideo((s) => s.close);
  if (!video) return null;

  return (
    <aside className="yt-dock" aria-label="YouTube player">
      <div className="yt-dock-head">
        <span className="yt-dock-title">{video.title}</span>
        <button className="icon-btn" onClick={close} aria-label="Close YouTube player">
          <Icon name="plus" size={20} />
        </button>
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
  );
}
