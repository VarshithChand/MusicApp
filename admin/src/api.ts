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
  createArtist: (fd: FormData) => request<Artist>("/admin/artists", form(fd)),
  createAlbum: (fd: FormData) => request<Album>("/admin/albums", form(fd)),
  createGenre: (name: string) => request<Genre>("/admin/genres", json({ name })),
};
