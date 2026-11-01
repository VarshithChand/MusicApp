import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AddToPlaylistSheet } from "./components/AddToPlaylistSheet";
import { Layout } from "./components/Layout";
import { YouTubeDock } from "./components/YouTubeDock";
import { HomeScreen } from "./screens/HomeScreen";
import { YouTubeScreen } from "./screens/YouTubeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { MovieScreen } from "./screens/MovieScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { NowPlayingScreen } from "./screens/NowPlayingScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SongListScreen } from "./screens/SongListScreen";
import { useAuth } from "./store/auth";

export default function App() {
  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }), []);
  const signedIn = useAuth((s) => !!s.accessToken);

  // Don't show one account's playlists and likes to the next person who logs in.
  useEffect(() => {
    if (!signedIn) queryClient.clear();
  }, [signedIn, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {signedIn ? (
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomeScreen />} />
              <Route path="youtube" element={<YouTubeScreen />} />
              <Route path="search" element={<SearchScreen />} />
              <Route path="library" element={<LibraryScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="account" element={<SettingsScreen />} />
              <Route path="list" element={<SongListScreen />} />
              <Route path="movie/:id" element={<MovieScreen />} />
            </Route>
            <Route path="now-playing" element={<NowPlayingScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <AddToPlaylistSheet />
          <YouTubeDock />
        </HashRouter>
      ) : (
        <LoginScreen />
      )}
    </QueryClientProvider>
  );
}
