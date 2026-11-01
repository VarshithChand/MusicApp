import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { DownloadApp } from "./DownloadApp";
import { useAuth } from "../store/auth";
import { useCurrentSong, usePlayer } from "../store/player";
import { useVideo } from "../store/video";
import { Cover } from "./Cover";
import { Icon, IconName } from "./Icon";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/youtube", label: "YouTube", icon: "youtube" },
  { to: "/library", label: "Library", icon: "library" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

function Tabs({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Main Navigation">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === "/"} className="tab-link">
          <Icon name={t.icon} size={20} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function PlayerBar() {
  const navigate = useNavigate();
  const song = useCurrentSong();
  const activeVideo = useVideo((s) => s.video);
  const { playing, loading, position, duration, toggle, next, prev, skipBy } = usePlayer();
  if (!song || activeVideo) return null;

  return (
    <div className="playerbar">
      <button className="playerbar-info" onClick={() => navigate("/now-playing")} aria-label="Open now playing">
        <Cover id={song.id} uri={song.cover_url} size={48} radius={10} />
        <span className="song-text">
          <span className="song-title">{song.title}</span>
          <span className="song-sub">{song.artist_name}</span>
        </span>
      </button>
      <div className="playerbar-controls">
        <button className="icon-btn hide-sm" onClick={prev} aria-label="Previous song" title="Previous song">
          <Icon name="prev" size={20} />
        </button>
        <button className="icon-btn hide-xs" onClick={() => skipBy(-10)} aria-label="Rewind 10 seconds" title="Rewind 10s">
          <Icon name="rewind" size={17} />
        </button>
        <button
          className="play-btn small"
          onClick={toggle}
          aria-label={loading ? "Loading" : playing ? "Pause" : "Play"}
          aria-busy={loading}
        >
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name={playing ? "pause" : "play"} size={20} />}
        </button>
        <button className="icon-btn hide-xs" onClick={() => skipBy(10)} aria-label="Forward 10 seconds" title="Forward 10s">
          <Icon name="fastForward" size={17} />
        </button>
        <button className="icon-btn" onClick={next} aria-label="Next song" title="Next song">
          <Icon name="next" size={20} />
        </button>
      </div>
      <div className={`playerbar-progress ${loading ? "loading" : ""}`} aria-hidden="true">
        <div style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** App chrome: sleek modern sidebar on wide screens, bottom tabs on mobile, mini player above both. */
export function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">
            <Icon name="play" size={18} />
          </span>
          <span className="brand-name">Music</span>
        </div>

        <Tabs className="side-tabs" />

        <div className="sidebar-foot">
          <DownloadApp className="btn download-btn">
            <Icon name="download" size={18} /> Android App
          </DownloadApp>
          <NavLink to="/settings" className="account-tile">
            <div className="avatar-sm">
              {(user?.name ?? "?").trim().charAt(0).toUpperCase()}
            </div>
            <div className="account-info">
              <span className="account-name">{user?.name || "Listener"}</span>
              <span className="account-sub">{user?.is_admin ? "Administrator" : "Account Settings"}</span>
            </div>
          </NavLink>
          <button className="btn ghost logout-btn" onClick={logout}>
            <Icon name="logout" size={18} /> Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <PlayerBar />
      <Tabs className="bottom-tabs" />
    </div>
  );
}
