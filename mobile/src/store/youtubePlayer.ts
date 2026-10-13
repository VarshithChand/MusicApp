import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface RecentVideo {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
}

type Info = { channel?: string | null; thumbnail?: string | null };

/**
 * The one YouTube video currently playing anywhere in the app (Home's trending row, Search results, the YouTube
 * page). Global, not per-screen, so it can float as a small corner box while the owner navigates elsewhere — the
 * same idea as the audio MiniPlayer, one shared player instance instead of one per screen.
 */
interface YouTubePlayerState {
  videoId: string | null;
  title: string;
  mode: 'full' | 'mini';
  recent: RecentVideo[];
  autoplay: boolean;
  queue: RecentVideo[];
  play: (videoId: string, title: string, info?: Info) => void;
  playFromList: (list: RecentVideo[], index: number) => void;
  playNext: () => void;
  setAutoplay: (on: boolean) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

const RECENT_LIMIT = 10;

export const useYouTubePlayer = create<YouTubePlayerState>()(
  persist(
    (set, get) => ({
      videoId: null,
      title: '',
      mode: 'full',
      recent: [],
      autoplay: true,
      queue: [],
      play: (videoId, title, info) =>
        set((s) => ({
          videoId,
          title,
          mode: 'full',
          recent: [
            { videoId, title, channel: info?.channel ?? null, thumbnail: info?.thumbnail ?? null },
            ...s.recent.filter((v) => v.videoId !== videoId),
          ].slice(0, RECENT_LIMIT),
        })),
      playFromList: (list, index) => {
        set({ queue: list });
        const v = list[index];
        if (v) get().play(v.videoId, v.title, { channel: v.channel, thumbnail: v.thumbnail });
      },
      playNext: () => {
        const { autoplay, queue, videoId } = get();
        if (!autoplay || !videoId) return;
        const i = queue.findIndex((v) => v.videoId === videoId);
        const next = i >= 0 ? queue[i + 1] : undefined;
        if (next) get().play(next.videoId, next.title, { channel: next.channel, thumbnail: next.thumbnail });
      },
      setAutoplay: (on) => set({ autoplay: on }),
      minimize: () => set({ mode: 'mini' }),
      maximize: () => set({ mode: 'full' }),
      close: () => set({ videoId: null, mode: 'full' }),
    }),
    {
      name: 'youtube-recent',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ recent: s.recent, autoplay: s.autoplay }),
    },
  ),
);
