import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Favorited local audio/video files, kept only on this device (AsyncStorage), not synced to the account: a content
 * URI only means something on the phone that found the file, so syncing it would just produce broken entries on any
 * other device. Keyed by content URI, which MediaStore keeps stable for a file's lifetime on this device.
 */
interface LocalFavoritesState {
  audio: string[];
  video: string[];
  hydrated: boolean;
  isFavorite: (kind: 'audio' | 'video', uri: string) => boolean;
  toggle: (kind: 'audio' | 'video', uri: string) => void;
}

export const useLocalFavorites = create<LocalFavoritesState>()(
  persist(
    (set, get) => ({
      audio: [],
      video: [],
      hydrated: false,
      isFavorite: (kind, uri) => get()[kind].includes(uri),
      toggle: (kind, uri) =>
        set((s) => ({
          [kind]: s[kind].includes(uri) ? s[kind].filter((u) => u !== uri) : [...s[kind], uri],
        })),
    }),
    {
      name: 'local-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
