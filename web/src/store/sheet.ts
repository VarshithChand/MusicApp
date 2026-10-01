import { create } from 'zustand';

/** Which song the "add to playlist" sheet is currently open for (null = closed). */
interface SheetState {
  songId: number | null;
  open: (songId: number) => void;
  close: () => void;
}

export const useSheet = create<SheetState>((set) => ({
  songId: null,
  open: (songId) => set({ songId }),
  close: () => set({ songId: null }),
}));
