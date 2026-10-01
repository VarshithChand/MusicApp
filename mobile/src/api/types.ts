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
