import { Song } from "../api/types";
import { usePlayer } from "../store/player";
import { useSheet } from "../store/sheet";
import { Cover } from "./Cover";
import { DownloadSong } from "./DownloadSong";
import { Icon } from "./Icon";

interface Props {
  song: Song;
  onPlay: () => void;
  /** Second line; defaults to the artist. */
  subtitle?: string;
  /** When given, shows a remove button (used inside playlists). */
  onRemove?: () => void;
}

export function SongRow({ song, onPlay, subtitle, onRemove }: Props) {
  const openSheet = useSheet((s) => s.open);
  const isLoading = usePlayer((s) => s.loading && s.queue[s.index]?.id === song.id);
  return (
    <div className="song-row">
      <button className="song-main" onClick={onPlay} aria-label={`Play ${song.title}`}>
        <span className="cover-wrap">
          <Cover id={song.id} uri={song.cover_url} size={52} radius={12} />
          {isLoading && (
            <span className="cover-loading" role="status" aria-label="Loading">
              <span className="spinner" />
            </span>
          )}
        </span>
        <span className="song-text">
          <span className="song-title">{song.title}</span>
          <span className="song-sub">{subtitle ?? song.artist_name}</span>
        </span>
      </button>
      <DownloadSong song={song} />
      <button className="icon-btn" onClick={() => openSheet(song.id)} aria-label={`Add ${song.title} to a playlist`}>
        <Icon name="plus" size={22} />
      </button>
      {onRemove && (
        <button className="icon-btn" onClick={onRemove} aria-label={`Remove ${song.title} from playlist`}>
          <Icon name="trash" size={20} />
        </button>
      )}
    </div>
  );
}
