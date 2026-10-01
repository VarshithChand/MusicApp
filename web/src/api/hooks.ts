import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './index';
import { Album, Artist, Playlist, SearchResults, Song } from './types';

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
