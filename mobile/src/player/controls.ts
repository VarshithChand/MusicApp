import { PermissionsAndroid, Platform } from 'react-native';
import TrackPlayer, { AppKilledPlaybackBehavior, Capability, Track } from 'react-native-track-player';
import { mediaUrl } from '../api/http';
import { LocalAudioFile, Song } from '../api/types';

let setup: Promise<void> | null = null;

/** Initialises the native player once and enables lock-screen / notification controls. */
/**
 * Android 13 and later refuse to show any notification until asked, and the playback controls are a
 * notification, so without this there is nothing on the lock screen to press. Declining only costs
 * the controls; the music itself plays either way.
 */
async function askToShowControls(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
      title: 'Playback controls',
      message: 'Let Musica show the player on your lock screen and notification shade.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
  } catch {
    // Not being able to ask is no reason to stop the music starting.
  }
}

export function setupPlayer(): Promise<void> {
  setup ??= (async () => {
    await askToShowControls();
    try {
      // Hand the pausing and resuming to the player: it then stops for a call, for another app
      // taking the sound, and when earbuds leave an ear, which the phone reports the same way.
      await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
    } catch {
      // Already initialised (e.g. after a JS reload) — safe to continue.
    }
    await TrackPlayer.updateOptions({
      android: {
        // Keep playing when the app is swiped away: the notification is how someone comes back to it.
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        // Stop rather than duck when something interrupts, so a song is not half-heard under it.
        alwaysPauseOnInterruption: true,
      },
      forwardJumpInterval: 5,
      backwardJumpInterval: 5,
      // Without this the song's position on the notification only moves when something else happens.
      progressUpdateEventInterval: 1,
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.JumpForward,
        Capability.JumpBackward,
        Capability.Stop,
      ],
      // What the notification itself offers. Said plainly rather than left to be inferred from the
      // list above, which also covers the headset and would crowd the notification with jump buttons
      // beside the skips. SeekTo is what puts the draggable position bar there.
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.SeekTo,
        Capability.Stop,
      ],
      // The three that survive when the notification is collapsed to a single line.
      compactCapabilities: [Capability.SkipToPrevious, Capability.Play, Capability.SkipToNext],
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

function toLocalTrack(file: LocalAudioFile): Track {
  return {
    id: `local-${file.id}`,
    url: file.uri, // a content:// URI from MediaStore; TrackPlayer plays it exactly like a remote http(s) URL
    title: file.title,
    artist: file.artist ?? 'Unknown artist',
    album: file.album ?? undefined,
    artwork: file.artworkUri ?? undefined,
    duration: file.durationMs / 1000,
  };
}

/** Replaces the queue with local on-device audio files and starts playing at `index`. */
export async function playLocalQueue(files: LocalAudioFile[], index = 0) {
  if (!files.length) return;
  await setupPlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add(files.map(toLocalTrack));
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
