export const API_URL: string = import.meta.env.VITE_API_URL ?? "https://musicapp-j5ji.onrender.com";

export interface Song {
  id: number;
  title: string;
  audio_url: string;
  cover_url: string | null;
  duration: number;
  artist_name: string;
  album_title: string | null;
  genre_name: string | null;
  play_count: number;
  downloadable: boolean;
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
  artist_name: string;
}
export interface Genre {
  id: number;
  name: string;
}
export interface Stats {
  users: number;
  songs: number;
  artists: number;
  albums: number;
  playlists: number;
}

export interface MoodInfo {
  slug: string;
  name: string;
  song_count: number;
}
export interface Movie {
  id: number;
  title: string;
  status: "draft" | "published";
  language: string | null;
  release_year: number | null;
  music_director: string | null;
  description: string | null;
  poster_url: string | null;
  artist_name: string;
  published_songs: number;
  draft_songs: number;
}
export interface SongMood {
  slug: string;
  primary: boolean;
  source: "manual" | "suggested";
}
export interface AdminSong {
  id: number;
  title: string;
  audio_url: string;
  duration: number;
  singers: string | null;
  lyricist: string | null;
  music_director: string | null;
  track_number: number | null;
  language: string | null;
  description: string | null;
  description_source: "manual" | "suggested";
  status: "draft" | "published";
  downloadable: boolean;
  format: string | null;
  file_size: number | null;
  moods: SongMood[];
}
export interface Suggestion {
  description: string;
  moods: { slug: string; primary: boolean }[];
  source: "suggested";
}
export interface UploadSummary {
  id: number;
  status: "processing" | "review" | "failed";
  filename: string;
  movie: string;
  total_files: number;
  processed_files: number;
  error: string | null;
  created_at: string;
}
export interface UploadItem {
  id: number;
  file_name: string;
  status: "ok" | "rejected" | "duplicate";
  reason: string | null;
  size: number | null;
}
export interface UploadDetail {
  job: UploadSummary & { album_id: number };
  items: UploadItem[];
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = "music-admin-tokens";
let tokens: Tokens | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
})();

function setTokens(t: Tokens | null) {
  tokens = t;
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable — the session just won't survive a reload
  }
}

export const isSignedIn = () => tokens !== null;
export const signOut = () => setTokens(null);

/** Audio and images are stored as absolute URLs (R2) or as paths under the API's /media. */
export const mediaUrl = (u: string | null) => (!u ? undefined : u.startsWith("http") ? u : `${API_URL}${u}`);

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (tokens) headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

async function refresh(): Promise<boolean> {
  if (!tokens) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });
  if (!res.ok) return false;
  setTokens(await res.json());
  return true;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && (await refresh())) res = await raw(path, init);
  if (res.status === 401) {
    setTokens(null);
    throw new Error("Session expired. Please log in again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new Error(typeof e === "string" ? e : "Request failed — check the form and try again.");
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const form = (body: FormData): RequestInit => ({ method: "POST", body });

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Login failed");
  if (!data.user.is_admin) throw new Error("This account is not an admin.");
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
}

export const api = {
  stats: () => request<Stats>("/admin/stats"),
  songs: () => request<Song[]>("/songs?limit=100"),
  artists: () => request<Artist[]>("/artists?limit=100"),
  albums: () => request<Album[]>("/albums?limit=100"),
  genres: () => request<Genre[]>("/genres"),
  createSong: (fd: FormData) => request<Song>("/admin/songs", form(fd)),
  deleteSong: (id: number) => request<void>(`/admin/songs/${id}`, { method: "DELETE" }),
  setDownloadable: (id: number, downloadable: boolean) =>
    request<{ id: number; downloadable: boolean }>(`/admin/songs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadable }),
    }),
  createArtist: (fd: FormData) => request<Artist>("/admin/artists", form(fd)),
  createAlbum: (fd: FormData) => request<Album>("/admin/albums", form(fd)),
  createGenre: (name: string) => request<Genre>("/admin/genres", json({ name })),

  // --- movie soundtracks ---------------------------------------------------
  moods: () => request<MoodInfo[]>("/moods"),
  movies: () => request<Movie[]>("/admin/movies"),
  movieSongs: (id: number) => request<AdminSong[]>(`/admin/movies/${id}/songs`),
  createMovie: (fd: FormData) => request<{ id: number }>("/admin/albums", form(fd)),
  patchMovie: (id: number, body: Record<string, unknown>) => request<unknown>(`/admin/albums/${id}`, patch(body)),
  publishMovie: (id: number) => request<{ published: number }>(`/admin/movies/${id}/publish`, { method: "POST" }),
  saveOrder: (id: number, songIds: number[]) =>
    request<void>(`/admin/movies/${id}/order`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ songIds }) }),
  patchSong: (id: number, body: Record<string, unknown>) => request<unknown>(`/admin/songs/${id}`, patch(body)),
  suggest: (id: number) => request<Suggestion>(`/admin/songs/${id}/suggest`),
  uploads: () => request<UploadSummary[]>("/admin/uploads"),
  upload: (id: number) => request<UploadDetail>(`/admin/uploads/${id}`),
};

const patch = (body: Record<string, unknown>): RequestInit => ({
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Uploads the ZIP with a progress callback (fetch can't report upload progress, XMLHttpRequest can). */
export function uploadZip(fd: FormData, onProgress: (fraction: number) => void): Promise<{ jobId: number }> {
  const send = (retried: boolean): Promise<{ jobId: number }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/admin/uploads`);
      if (tokens) xhr.setRequestHeader("Authorization", `Bearer ${tokens.accessToken}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
      xhr.onload = async () => {
        if (xhr.status === 401 && !retried && (await refresh())) return send(true).then(resolve, reject);
        let body: { jobId?: number; error?: string } | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status === 202 && body?.jobId) return resolve({ jobId: body.jobId });
        reject(new Error(body?.error ?? "The upload failed."));
      };
      xhr.send(fd);
    });
  return send(false);
}
