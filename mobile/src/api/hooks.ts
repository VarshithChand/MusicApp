import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import { api } from './index';
import {
  Album,
  Artist,
  DiscoverResponse,
  FavoriteYouTubeVideo,
  MoodCount,
  Movie,
  MovieDetail,
  Playlist,
  SearchResults,
  Song,
  YouTubeResponse,
  YouTubeVideoResponse,
} from './types';

export const useSongs = (sort?: 'popular') =>
  useQuery({ queryKey: ['songs', sort], queryFn: () => api<Song[]>(`/songs${sort ? `?sort=${sort}` : ''}`) });

export const useRecentlyPlayed = () =>
  useQuery({ queryKey: ['recent'], queryFn: () => api<Song[]>('/users/me/recently-played') });

export const useArtists = () => useQuery({ queryKey: ['artists'], queryFn: () => api<Artist[]>('/artists') });

export const useAlbums = () => useQuery({ queryKey: ['albums'], queryFn: () => api<Album[]>('/albums') });

export const usePlaylists = () => useQuery({ queryKey: ['playlists'], queryFn: () => api<Playlist[]>('/playlists') });

/** Account counts for the admin page: everyone who can log in, and how many were active recently. */
export const useAdminUserStats = () =>
  useQuery({
    queryKey: ['admin-user-stats'],
    queryFn: () => api<{ total: number; active: number; inactive: number; windowDays: number }>('/admin/user-stats'),
    staleTime: 60_000,
  });

export const useLikedSongs = () =>
  useQuery({ queryKey: ['liked'], queryFn: () => api<Song[]>('/users/me/liked-songs') });

/** Movie soundtracks matching a name, music director or credited artist (empty query returns the newest ones). */
export function useMovies(q = '', language = '') {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (language) params.set('language', language);
  return useQuery({
    queryKey: ['movies', q.trim(), language],
    queryFn: () => api<Movie[]>(`/movies?${params.toString()}`),
    staleTime: 60_000,
  });
}

export function useMovie(id: number | string | undefined) {
  return useQuery({
    queryKey: ['movie', id],
    queryFn: () => api<MovieDetail>(`/movies/${id}`),
    enabled: id !== undefined,
  });
}

/** Style, mood and genre labels an admin has approved, with how many published songs carry each one. */
export const useMoods = () => useQuery({ queryKey: ['moods'], queryFn: () => api<MoodCount[]>('/moods'), staleTime: 5 * 60_000 });

/** Songs filtered by label (a song needs ALL chosen labels) and/or language. Disabled until a filter is chosen. */
export function useFilteredSongs(filters: { labels?: string[]; language?: string }) {
  const params = new URLSearchParams({ limit: '60' });
  if (filters.labels?.length) params.set('labels', filters.labels.join(','));
  if (filters.language) params.set('language', filters.language);
  return useQuery({
    queryKey: ['songs-filtered', (filters.labels ?? []).join(','), filters.language ?? ''],
    queryFn: () => api<Song[]>(`/songs?${params.toString()}`),
    enabled: !!(filters.labels?.length || filters.language),
  });
}

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
export function useYouTube(q: string, order: 'relevance' | 'viewCount' | 'date' = 'relevance', lang?: string, mood?: string | null) {
  return useQuery({
    queryKey: ['youtube', q, order, lang ?? 'any', mood ?? 'any'],
    queryFn: () =>
      api<YouTubeResponse>(
        `/discover/youtube?q=${encodeURIComponent(q)}&order=${order}${lang ? `&lang=${lang}` : ''}${
          mood ? `&mood=${encodeURIComponent(mood)}` : ''
        }`,
      ),
    enabled: q.trim().length > 1,
    staleTime: 10 * 60_000,
  });
}

/**
 * Videos held in the app's own library, for what plays next. It never reaches YouTube, so the list
 * under the player can follow the chosen filter without costing any of the day's searches.
 */
export function useLibrary(lang: string | null, mood: string | null) {
  return useQuery({
    queryKey: ['library', lang ?? 'any', mood ?? 'any'],
    queryFn: () =>
      api<YouTubeResponse>(`/discover/library?limit=25${lang ? `&lang=${lang}` : ''}${mood ? `&mood=${encodeURIComponent(mood)}` : ''}`),
    enabled: !!mood,
    staleTime: 10 * 60_000,
  });
}

/** Looks up one YouTube video by its ID (the Video page: paste a URL, fetch its details). */
export function useYouTubeVideo(videoId: string | null) {
  return useQuery({
    queryKey: ['youtube-video', videoId],
    queryFn: () => api<YouTubeVideoResponse>(`/discover/youtube-video?id=${encodeURIComponent(videoId!)}`),
    enabled: !!videoId,
    retry: false,
    staleTime: 60 * 60_000,
  });
}

/** YouTube videos the user has saved from the Video page. Synced to the account. */
export const useYouTubeFavorites = () =>
  useQuery({ queryKey: ['youtube-favorites'], queryFn: () => api<FavoriteYouTubeVideo[]>('/discover/youtube-video/favorites') });

export function useToggleYouTubeFavorite() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['youtube-favorites'] });
  return {
    add: useMutation({
      mutationFn: (v: FavoriteYouTubeVideo) =>
        api<void>(`/discover/youtube-video/${v.videoId}/favorite`, { method: 'POST', body: { title: v.title, channel: v.channel, thumbnail: v.thumbnail } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (videoId: string) => api<void>(`/discover/youtube-video/${videoId}/favorite`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

/** Trending (last 30 days) or all-time popular music videos in a language, played only in YouTube's own player. */
const NO_LANGUAGES: string[] = [];

/**
 * The languages the signed-in listener picked, and the one to lead with.
 * An empty list means no preference, so the app falls back to its usual default.
 */
export function usePreferredLanguages() {
  const languages = useAuth((s) => s.user?.languages) ?? NO_LANGUAGES;
  return { languages, primary: languages[0] ?? 'te' };
}

export function useTrending(kind: 'trending' | 'popular', lang = 'te') {
  return useQuery({
    queryKey: ['trending', kind, lang],
    queryFn: () => api<YouTubeResponse>(`/discover/trending?kind=${kind}&lang=${lang}`),
    staleTime: 30 * 60_000,
  });
}
