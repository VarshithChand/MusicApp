import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api } from "../api";
import { request } from "../api/http";
import { AuthResponse, User } from "../api/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  updatePreferences: (prefs: {
    gender?: 'male' | 'female';
    songTastes?: string[];
    dateOfBirth?: string;
    genres?: string[];
    languages?: string[];
  }) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => {
      const save = (r: AuthResponse): void => {
        set({ user: r.user, accessToken: r.accessToken, refreshToken: r.refreshToken });
      };
      return {
        user: null,
        accessToken: null,
        refreshToken: null,
        login: async (email, password) =>
          save(await request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } })),
        register: async (name, email, password) =>
          save(
            await request<AuthResponse>("/auth/register", {
              method: "POST",
              body: { name, email, password, gender: "male", dateOfBirth: "2000-01-01" },
            }),
          ),
        loginWithGoogle: async (idToken) => save(await request<AuthResponse>("/auth/google", { method: "POST", body: { idToken } })),
        updatePreferences: async (prefs) => {
          const user = await api<User>('/auth/me/preferences', { method: 'PUT', body: prefs });
          set((s) => ({ user: s.user ? { ...s.user, ...user } : user }));
        },
        setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
        logout: () => set({ user: null, accessToken: null, refreshToken: null }),
      };
    },
    {
      name: "music-web-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);
