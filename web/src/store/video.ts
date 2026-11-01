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
  queue: YouTubeVideoItem[];
  recent: YouTubeVideoItem[];
  open: (video: YouTubeVideoItem, queue?: YouTubeVideoItem[], mode?: VideoViewMode) => void;
  setMode: (mode: VideoViewMode) => void;
  setQueue: (queue: YouTubeVideoItem[]) => void;
  playFromQueue: (index: number) => void;
  skip: (delta: 1 | -1) => void;
  close: () => void;
}

const RECENT_LIMIT = 30;

export const useVideo = create<VideoState>()(
  persist(
    (set, get) => ({
      video: null,
      mode: 'half',
      queue: [],
      recent: [],
      open: (video, queue, mode) =>
        set((s) => ({
          video,
          mode: mode ?? 'half',
          queue: queue && queue.length ? queue : s.queue,
          recent: [
            video,
            ...s.recent.filter((v) => v.videoId !== video.videoId),
          ].slice(0, RECENT_LIMIT),
        })),
      setMode: (mode) => set({ mode }),
      setQueue: (queue) => set({ queue }),
      playFromQueue: (index) => {
        const item = get().queue[index];
        if (item) {
          get().open(item, get().queue, get().mode);
        }
      },
      skip: (delta) => {
        const { queue, video } = get();
        if (!queue.length || !video) return;
        const i = queue.findIndex((v) => v.videoId === video.videoId);
        const target = i >= 0 ? queue[i + delta] : queue[0];
        if (target) {
          get().open(target, queue, get().mode);
        }
      },
      close: () => set({ video: null }),
    }),
    {
      name: "music-web-yt-recent",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ recent: s.recent, mode: s.mode }),
    },
  ),
);
