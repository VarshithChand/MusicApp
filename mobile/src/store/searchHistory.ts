import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SearchHistoryState {
  history: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
}

const MAX_HISTORY = 20;

export const useSearchHistory = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      add: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed || trimmed.length < 2) return;
        const current = get().history;
        const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
        set({ history: [trimmed, ...filtered].slice(0, MAX_HISTORY) });
      },
      remove: (query: string) => {
        set({ history: get().history.filter((item) => item !== query) });
      },
      clear: () => {
        set({ history: [] });
      },
    }),
    {
      name: '@music_search_history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
