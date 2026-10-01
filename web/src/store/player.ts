import { create } from "zustand";
import { api } from "../api";
import { mediaUrl } from "../api/http";
import { Song } from "../api/types";
import { useAuth } from "./auth";

interface PlayerState {
  queue: Song[];
  index: number;
  playing: boolean;
  /** True while a song is loading or buffering (show a spinner). */
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  repeat: boolean;
  playQueue: (songs: Song[], index?: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  toggleRepeat: () => void;
  shuffleUpNext: () => void;
}

const audio = new Audio();
audio.preload = "metadata";

export const usePlayer = create<PlayerState>((set, get) => {
  /** Loads and starts the song at `i` in the current queue. */
  const load = (i: number) => {
    const song = get().queue[i];
    if (!song) return;
    set({ index: i, position: 0, duration: song.duration, loading: true });
    audio.src = mediaUrl(song.audio_url) ?? "";
    audio.play().catch(() => set({ playing: false, loading: false }));

    if (useAuth.getState().accessToken) api(`/songs/${song.id}/played`, { method: "POST" }).catch(() => {});

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist_name,
        album: song.album_title ?? "",
        artwork: song.cover_url ? [{ src: mediaUrl(song.cover_url)! }] : [],
      });
    }
  };

  audio.addEventListener("timeupdate", () => set({ position: audio.currentTime }));
  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration)) set({ duration: audio.duration });
  });
  audio.addEventListener("play", () => set({ playing: true }));
  // Loading starts when the browser begins fetching or runs out of data, and ends once playback can continue.
  audio.addEventListener("loadstart", () => set({ loading: true }));
  audio.addEventListener("waiting", () => set({ loading: true }));
  audio.addEventListener("stalled", () => set({ loading: true }));
  audio.addEventListener("canplay", () => set({ loading: false }));
  audio.addEventListener("playing", () => set({ loading: false }));
  audio.addEventListener("error", () => set({ loading: false, playing: false }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("ended", () => get().next());

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => get().next());
    navigator.mediaSession.setActionHandler("previoustrack", () => get().prev());
    navigator.mediaSession.setActionHandler("seekto", (d) => d.seekTime != null && get().seek(d.seekTime));
  }

  return {
    queue: [],
    index: 0,
    playing: false,
    loading: false,
    position: 0,
    duration: 0,
    volume: 1,
    repeat: false,

    playQueue: (songs, index = 0) => {
      if (!songs.length) return;
      set({ queue: songs });
      load(index);
    },
    toggle: () => {
      if (!get().queue.length) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    },
    next: () => {
      const { index, queue, repeat } = get();
      if (index + 1 < queue.length) load(index + 1);
      else if (repeat && queue.length) load(0);
      else audio.pause();
    },
    prev: () => {
      const { index } = get();
      if (audio.currentTime > 3 || index === 0) audio.currentTime = 0;
      else load(index - 1);
    },
    seek: (sec) => {
      audio.currentTime = sec;
      set({ position: sec });
    },
    setVolume: (v) => {
      audio.volume = v;
      set({ volume: v });
    },
    toggleRepeat: () => set((s) => ({ repeat: !s.repeat })),
    shuffleUpNext: () => {
      const { queue, index } = get();
      const upcoming = queue.slice(index + 1);
      for (let i = upcoming.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
      }
      set({ queue: [...queue.slice(0, index + 1), ...upcoming] });
    },
  };
});

/** The song currently loaded in the player, if any. */
export const useCurrentSong = () => usePlayer((s) => s.queue[s.index] ?? null);
