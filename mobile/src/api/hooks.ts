import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './index';
import { Album, Artist, DiscoverResponse, Playlist, SearchResults, Song, YouTubeResponse } from './types';

export const useSongs = (sort?: 'popular') =>
  useQuery({ queryKey: ['songs', sort], queryFn: () => api<Song[]>(`/songs${sort ? `?sort=${sort}` : ''}`) });

export const useRecentlyPlayed = () =>
  useQuery({ queryKey: ['recent'], queryFn: () => api<Song[]>('/users/me/recently-played') });

export const useArtists = () => useQuery({ queryKey: ['artists'], queryFn: () => api<Artist[]>('/artists') });

export const useAlbums = () => useQuery({ queryKey: ['albums'], queryFn: () => api<Album[]>('/albums') });

export const usePlaylists = () => useQuery({ queryKey: ['playlists'], queryFn: () => api<Playlist[]>('/playlists') });

export const useLikedSongs = () =>
  useQuery({ queryKey: ['liked'], queryFn: () => api<Song[]>('/users/me/liked-songs') });

export function useSearch(q: string) {
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => api<SearchResults>(`/songs/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ songId, liked }: { songId: number; liked: boolean }) =>
      api<void>(`/songs/${songId}/like`, { method: liked ? 'DELETE' : 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['liked'] }),
  });
}

export function usePlaylistMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['playlists'] });
  const refreshAll = () =>
    qc.invalidateQueries({ queryKey: ['playlists'] }).then(() => qc.invalidateQueries({ queryKey: ['songlist'] }));
  return {
    create: useMutation({
      mutationFn: (name: string) => api<Playlist>('/playlists', { method: 'POST', body: { name } }),
      onSuccess: refresh,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) =>
        api<Playlist>(`/playlists/${id}`, { method: 'PUT', body: { name } }),
      onSuccess: refreshAll,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api<void>(`/playlists/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    addSong: useMutation({
      mutationFn: ({ id, songId }: { id: number; songId: number }) =>
        api<void>(`/playlists/${id}/songs`, { method: 'POST', body: { songId } }),
      onSuccess: refreshAll,
    }),
    removeSong: useMutation({
      mutationFn: ({ id, songId }: { id: number; songId: number }) =>
        api<void>(`/playlists/${id}/songs/${songId}`, { method: 'DELETE' }),
      onSuccess: refreshAll,
    }),
  };
}

/** Searches the free-music catalogue as the user types (empty until a catalogue key is configured). */
export function useDiscover(q: string) {
  return useQuery({
    queryKey: ['discover', q],
    queryFn: () => api<DiscoverResponse>(`/discover/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 1,
    staleTime: 5 * 60_000,
  });
}

/** Adds a catalogue song to our library (and starts copying its audio) and returns the new library song. */
export function useImportSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (externalId: string) => api<Song>('/discover/import', { method: 'POST', body: { externalId } }),
    onSuccess: () => {
      for (const key of ['songs', 'artists', 'albums', 'search']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

/** Searches YouTube's Music category (empty until the server has a YouTube key). */
export function useYouTube(q: string) {
  return useQuery({
    queryKey: ['youtube', q],
    queryFn: () => api<YouTubeResponse>(`/discover/youtube?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 1,
    staleTime: 10 * 60_000,
  });
}

/** Trending (last 30 days) or all-time popular music videos in a language, played only in YouTube's own player. */
export function useTrending(kind: 'trending' | 'popular', lang = 'te') {
  return useQuery({
    queryKey: ['trending', kind, lang],
    queryFn: () => api<YouTubeResponse>(`/discover/trending?kind=${kind}&lang=${lang}`),
    staleTime: 30 * 60_000,
  });
}
