import { create } from 'zustand';

/**
 * The one YouTube video currently playing anywhere in the app (Home's trending row, Search results, the YouTube
 * page). Global, not per-screen, so it can float as a small corner box while the owner navigates elsewhere — the
 * same idea as the audio MiniPlayer, one shared player instance instead of one per screen.
 */
interface YouTubePlayerState {
  videoId: string | null;
  title: string;
  mode: 'full' | 'mini';
  play: (videoId: string, title: string) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

export const useYouTubePlayer = create<YouTubePlayerState>((set) => ({
  videoId: null,
  title: '',
  mode: 'full',
  play: (videoId, title) => set({ videoId, title, mode: 'full' }),
  minimize: () => set({ mode: 'mini' }),
  maximize: () => set({ mode: 'full' }),
  close: () => set({ videoId: null, mode: 'full' }),
}));
