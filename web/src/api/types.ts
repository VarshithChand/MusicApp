export interface User {
  id: number;
  name: string;
  email: string;
  is_admin?: boolean;
}

export interface Song {
  id: number;
  title: string;
  audio_url: string;
  cover_url: string | null;
  duration: number;
  artist_id: number;
  artist_name: string;
  album_id: number | null;
  album_title: string | null;
  genre_id: number | null;
  genre_name: string | null;
  /** Set for songs imported from an outside catalogue (Creative Commons licence link). */
  license_url?: string | null;
  source?: string | null;
  /** True when users may download this song (the admin has the right to share it). */
  downloadable?: boolean;
  // Movie-soundtrack details (empty for older songs)
  singers?: string | null;
  music_director?: string | null;
  language?: string | null;
  description?: string | null;
  /** "suggested" until an admin confirms it. */
  description_source?: "manual" | "suggested";
  track_number?: number | null;
  /** Mood slugs, main mood first, e.g. ["romantic", "melody"]. */
  moods?: string[];
}

export interface Artist {
  id: number;
  name: string;
  image_url: string | null;
}

export interface Album {
  id: number;
  title: string;
  cover_url: string | null;
  artist_id: number;
  artist_name: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Playlist {
  id: number;
  name: string;
  song_count: number;
}

export interface SearchResults {
  songs: Song[];
  artists: Artist[];
  albums: Album[];
  genres: Genre[];
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** A song found in the free-music catalogue, not yet in our library. */
export interface DiscoverTrack {
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  cover: string | null;
  duration: number;
  streamUrl: string;
  licenseUrl: string | null;
}

export interface DiscoverResponse {
  configured: boolean;
  results: DiscoverTrack[];
}

/** A music video found on YouTube. It is only ever played in YouTube's own embedded player. */
export interface YouTubeResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string | null;
}

export interface YouTubeResponse {
  configured: boolean;
  results: YouTubeResult[];
}

/** A published movie soundtrack (an album with extra details). */
export interface Movie {
  id: number;
  title: string;
  description: string | null;
  release_year: number | null;
  language: string | null;
  music_director: string | null;
  poster_url: string | null;
  artist_id: number;
  artist_name: string;
  song_count: number;
}

export interface MovieDetail extends Movie {
  songs: Song[];
}

export interface MoodCount {
  slug: string;
  name: string;
  /** style = energy/feel (Melody, DJ, Mass…), mood = emotion, genre = tradition. */
  kind: 'style' | 'mood' | 'genre';
  song_count: number;
}
