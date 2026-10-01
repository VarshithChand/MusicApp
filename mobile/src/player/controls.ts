import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Track } from 'react-native-track-player';
import { mediaUrl } from '../api/http';
import { Song } from '../api/types';

let setup: Promise<void> | null = null;

/** Initialises the native player once and enables lock-screen / notification controls. */
export function setupPlayer(): Promise<void> {
  setup ??= (async () => {
    try {
      await TrackPlayer.setupPlayer();
    } catch {
      // Already initialised (e.g. after a JS reload) — safe to continue.
    }
    await TrackPlayer.updateOptions({
      android: { appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification },
      forwardJumpInterval: 5,
      backwardJumpInterval: 5,
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    });
  })();
  return setup;
}

export function toTrack(song: Song): Track {
  return {
    id: String(song.id),
    url: mediaUrl(song.audio_url)!,
    title: song.title,
    artist: song.artist_name,
    album: song.album_title ?? undefined,
    artwork: mediaUrl(song.cover_url),
    duration: song.duration,
    // Custom field: lets the player screen show a Download button only for songs users may download.
    downloadable: song.downloadable ?? false,
  };
}

/** Replaces the queue with `songs` and starts playing at `index`. */
export async function playQueue(songs: Song[], index = 0) {
  if (!songs.length) return;
  await setupPlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add(songs.map(toTrack));
  await TrackPlayer.skip(index);
  await TrackPlayer.play();
}

/** Shuffles everything after the current track. */
export async function shuffleUpNext() {
  const [queue, active] = await Promise.all([TrackPlayer.getQueue(), TrackPlayer.getActiveTrackIndex()]);
  const from = (active ?? -1) + 1;
  const upcoming = queue.slice(from);
  if (upcoming.length < 2) return;
  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
  }
  await TrackPlayer.removeUpcomingTracks();
  await TrackPlayer.add(upcoming);
}
