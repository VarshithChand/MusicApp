import { Modal } from "./Modal";

interface Props {
  videoId: string;
  title: string;
  onClose: () => void;
}

/**
 * Plays a video in YouTube's own embedded player. The player has to stay visible and unmodified
 * (YouTube's terms), so this is a plain embed — nothing is downloaded or stored.
 */
export function YouTubeModal({ videoId, title, onClose }: Props) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="yt-frame">
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <p className="muted small">Playing from YouTube.</p>
    </Modal>
  );
}
