import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SearchSource = 'youtube' | 'web';

interface SearchSourceState {
  source: SearchSource;
  setSource: (source: SearchSource) => void;
  toggleSource: () => void;
}

export const useSearchSource = create<SearchSourceState>()(
  persist(
    (set, get) => ({
      source: 'youtube', // Default to YouTube as requested
      setSource: (source: SearchSource) => set({ source }),
      toggleSource: () => set({ source: get().source === 'youtube' ? 'web' : 'youtube' }),
    }),
    {
      name: '@music_search_source',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
