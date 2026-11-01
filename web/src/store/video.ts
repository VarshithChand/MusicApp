import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type VideoViewMode = 'popup' | 'half' | 'full';

export interface YouTubeVideoItem {
  videoId: string;
  title: string;
  channel?: string | null;
  thumbnail?: string | null;
}

interface VideoState {
  video: YouTubeVideoItem | null;
  mode: VideoViewMode;
  recent: YouTubeVideoItem[];
  open: (video: YouTubeVideoItem, mode?: VideoViewMode) => void;
  setMode: (mode: VideoViewMode) => void;
  close: () => void;
}

const RECENT_LIMIT = 20;

export const useVideo = create<VideoState>()(
  persist(
    (set) => ({
      video: null,
      mode: 'popup',
      recent: [],
      open: (video, mode) =>
        set((s) => ({
          video,
          mode: mode ?? s.mode ?? 'popup',
          recent: [
            video,
            ...s.recent.filter((v) => v.videoId !== video.videoId),
          ].slice(0, RECENT_LIMIT),
        })),
      setMode: (mode) => set({ mode }),
      close: () => set({ video: null }),
    }),
    {
      name: "music-web-yt-recent",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ recent: s.recent, mode: s.mode }),
    },
  ),
);
