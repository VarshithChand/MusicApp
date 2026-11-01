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
  boost: number; // Volume boost percent (100 = 100% normal, 125 = 125%, 150 = 150%, 200 = 200%)
  repeat: boolean;
  playQueue: (songs: Song[], index?: number) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  /** Jumps forward (positive) or back (negative) by `sec` seconds, staying inside the song. */
  skipBy: (sec: number) => void;
  setVolume: (v: number) => void;
  setBoost: (b: number) => void;
  toggleRepeat: () => void;
  shuffleUpNext: () => void;
}

const audio = new Audio();
audio.preload = "metadata";
audio.crossOrigin = "anonymous";

// Web Audio API Graph for real volume boosting above 100%
let audioCtx: AudioContext | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;

function ensureAudioGraph() {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }

  if (!sourceNode && audioCtx) {
    try {
      sourceNode = audioCtx.createMediaElementSource(audio);
      gainNode = audioCtx.createGain();
      compressorNode = audioCtx.createDynamicsCompressor();

      // Soft limiting compressor to prevent harsh digital clipping when boosted above 100%
      compressorNode.threshold.setValueAtTime(-4, audioCtx.currentTime);
      compressorNode.knee.setValueAtTime(24, audioCtx.currentTime);
      compressorNode.ratio.setValueAtTime(14, audioCtx.currentTime);
      compressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
      compressorNode.release.setValueAtTime(0.2, audioCtx.currentTime);

      sourceNode.connect(gainNode);
      gainNode.connect(compressorNode);
      compressorNode.connect(audioCtx.destination);
    } catch (e) {
      console.warn("Web Audio GainNode setup:", e);
    }
  }
}

function applyVolume(vol: number, boostPct: number) {
  ensureAudioGraph();
  if (gainNode && audioCtx) {
    // Volume: 0..1, Boost: 100..200 (100% -> 1.0x, 125% -> 1.25x, 150% -> 1.5x, 200% -> 2.0x)
    const multiplier = Math.max(0, vol * (boostPct / 100));
    gainNode.gain.setValueAtTime(multiplier, audioCtx.currentTime);
    audio.volume = 1;
  } else {
    audio.volume = Math.min(1, Math.max(0, vol));
  }
}

const initialBoost = typeof window !== "undefined" ? Number(localStorage.getItem("music-vol-boost") || "100") : 100;

export const usePlayer = create<PlayerState>((set, get) => {
  /** Loads and starts the song at `i` in the current queue. */
  const load = (i: number) => {
    const song = get().queue[i];
    if (!song) return;
    set({ index: i, position: 0, duration: song.duration, loading: true });
    audio.src = mediaUrl(song.audio_url) ?? "";
    
    ensureAudioGraph();
    applyVolume(get().volume, get().boost);

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
  audio.addEventListener("play", () => {
    ensureAudioGraph();
    applyVolume(get().volume, get().boost);
    set({ playing: true });
  });
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
    navigator.mediaSession.setActionHandler("seekbackward", () => get().skipBy(-5));
    navigator.mediaSession.setActionHandler("seekforward", () => get().skipBy(5));
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
    boost: initialBoost,
    repeat: false,

    playQueue: (songs, index = 0) => {
      if (!songs.length) return;
      set({ queue: songs });
      load(index);
    },
    pause: () => audio.pause(),
    toggle: () => {
      if (!get().queue.length) return;
      ensureAudioGraph();
      applyVolume(get().volume, get().boost);
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
    skipBy: (sec) => {
      const max = Number.isFinite(audio.duration) ? audio.duration : get().duration;
      get().seek(Math.min(Math.max(audio.currentTime + sec, 0), max || 0));
    },
    setVolume: (v) => {
      set({ volume: v });
      applyVolume(v, get().boost);
    },
    setBoost: (b) => {
      set({ boost: b });
      if (typeof window !== "undefined") {
        localStorage.setItem("music-vol-boost", String(b));
      }
      applyVolume(get().volume, b);
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
