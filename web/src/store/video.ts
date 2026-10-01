import { create } from "zustand";

/** The YouTube video currently shown in the docked player (null = closed). */
interface VideoState {
  video: { videoId: string; title: string } | null;
  open: (video: { videoId: string; title: string }) => void;
  close: () => void;
}

export const useVideo = create<VideoState>((set) => ({
  video: null,
  open: (video) => set({ video }),
  close: () => set({ video: null }),
}));
