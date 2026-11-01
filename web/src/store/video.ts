import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface YouTubeVideoItem {
  videoId: string;
  title: string;
  channel?: string | null;
  thumbnail?: string | null;
}

interface VideoState {
  video: YouTubeVideoItem | null;
  recent: YouTubeVideoItem[];
  open: (video: YouTubeVideoItem) => void;
  close: () => void;
}

const RECENT_LIMIT = 20;

export const useVideo = create<VideoState>()(
  persist(
    (set) => ({
      video: null,
      recent: [],
      open: (video) =>
        set((s) => ({
          video,
          recent: [
            video,
            ...s.recent.filter((v) => v.videoId !== video.videoId),
          ].slice(0, RECENT_LIMIT),
        })),
      close: () => set({ video: null }),
    }),
    {
      name: "music-web-yt-recent",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ recent: s.recent }),
    },
  ),
);
