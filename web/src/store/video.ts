import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type VideoViewMode = 'half' | 'mini' | 'full' | 'popup';

export interface YouTubeVideoItem {
  videoId: string;
  title: string;
  channel?: string | null;
  thumbnail?: string | null;
  durationSeconds?: number | null;
}

interface VideoState {
  video: YouTubeVideoItem | null;
  mode: VideoViewMode;
  isPlaying: boolean;
  queue: YouTubeVideoItem[];
  recent: YouTubeVideoItem[];
  open: (video: YouTubeVideoItem, queue?: YouTubeVideoItem[], mode?: VideoViewMode) => void;
  setMode: (mode: VideoViewMode) => void;
  setQueue: (queue: YouTubeVideoItem[]) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  playFromQueue: (index: number) => void;
  skip: (delta: 1 | -1, fallbackQueue?: YouTubeVideoItem[]) => void;
  close: () => void;
}

const RECENT_LIMIT = 30;

export const useVideo = create<VideoState>()(
  persist(
    (set, get) => ({
      video: null,
      mode: 'half',
      isPlaying: true,
      queue: [],
      recent: [],
      open: (video, queue, mode) =>
        set((s) => ({
          video,
          isPlaying: true,
          mode: mode ?? 'half',
          queue: queue && queue.length ? queue : s.queue,
          recent: [
            video,
            ...s.recent.filter((v) => v.videoId !== video.videoId),
          ].slice(0, RECENT_LIMIT),
        })),
      setMode: (mode) => set({ mode }),
      setQueue: (queue) => set({ queue }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      playFromQueue: (index) => {
        const item = get().queue[index];
        if (item) {
          get().open(item, get().queue, get().mode);
        }
      },
      skip: (delta, fallbackQueue) => {
        const { queue, video, mode } = get();
        const list = queue.length > 0 ? queue : (fallbackQueue && fallbackQueue.length > 0 ? fallbackQueue : []);
        if (!list.length || !video) return;
        const i = list.findIndex((v) => v.videoId === video.videoId);
        let nextIndex = i >= 0 ? i + delta : (delta > 0 ? 0 : list.length - 1);
        if (nextIndex < 0) {
          nextIndex = list.length - 1;
        } else if (nextIndex >= list.length) {
          nextIndex = 0;
        }
        const target = list[nextIndex];
        if (target) {
          get().open(target, list, mode);
        }
      },
      close: () => set({ video: null, isPlaying: false }),
    }),
    {
      name: "music-web-yt-recent",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ recent: s.recent, mode: s.mode }),
    },
  ),
);
