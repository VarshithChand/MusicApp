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

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (e) => {
    if (e.track?.id && useAuth.getState().accessToken) {
      api(`/songs/${e.track.id}/played`, { method: 'POST' }).catch(() => {});
    }
  });
}
