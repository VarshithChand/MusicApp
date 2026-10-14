import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SelectionState {
  /** Language code, or null for the listener's account preference. */
  language: string | null;
  /** Genre key, or null for every genre. */
  genre: string | null;
  setLanguage: (language: string | null) => void;
  setGenre: (genre: string | null) => void;
}

/**
 * What the listener picked on Home. The YouTube page reads the same thing, so choosing a language
 * in one place is not undone by the other, and it is kept so the app opens where they left it.
 */
export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      language: null,
      genre: null,
      setLanguage: (language) => set({ language }),
      setGenre: (genre) => set({ genre }),
    }),
    { name: 'selection', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
