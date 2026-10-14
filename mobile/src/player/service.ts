import TrackPlayer, { Event } from 'react-native-track-player';
import { api } from '../api';
import { useAuth } from '../store/auth';

// Runs the remote (lock screen / notification / headset) controls and counts plays.
export default async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
  TrackPlayer.addEventListener(Event.RemoteJumpForward, (e) => TrackPlayer.seekBy(e.interval));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, (e) => TrackPlayer.seekBy(-e.interval));
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => TrackPlayer.seekTo(e.position));
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  /**
   * Something else wants the sound: a call, another app, or an earbud leaving an ear, which the
   * phone reports the same way. Pause while it lasts, and pick the song up again afterwards.
   */
  TrackPlayer.addEventListener(Event.RemoteDuck, async (e) => {
    if (e.paused || e.permanent) await TrackPlayer.pause();
    else await TrackPlayer.play();
  });

  /**
   * A track that will not play, usually a local file that has been moved or deleted since the list
   * was built. Step over it rather than leaving the notification sitting on a song that is silent.
   */
  TrackPlayer.addEventListener(Event.PlaybackError, async () => {
    try {
      const queue = await TrackPlayer.getQueue();
      const at = await TrackPlayer.getActiveTrackIndex();
      if (at !== undefined && at + 1 < queue.length) await TrackPlayer.skipToNext();
      else await TrackPlayer.reset();
    } catch {
      // Nothing more to be done; leaving it stopped is better than looping on the failure.
    }
  });

  // At the end of the list, clear the notification rather than leave a dead one behind.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => TrackPlayer.reset());

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (e) => {
    if (e.track?.id && !String(e.track.id).startsWith('local-') && useAuth.getState().accessToken) {
      api(`/songs/${e.track.id}/played`, { method: 'POST' }).catch(() => {});
    }
  });
}
