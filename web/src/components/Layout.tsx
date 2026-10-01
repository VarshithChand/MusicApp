import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { APK_URL } from "../config";
import { useAuth } from "../store/auth";
import { useCurrentSong, usePlayer } from "../store/player";
import { Cover } from "./Cover";
import { Icon, IconName } from "./Icon";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/library", label: "Library", icon: "library" },
];

function Tabs({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Main">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className="tab-link">
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function PlayerBar() {
  const navigate = useNavigate();
  const song = useCurrentSong();
  const { playing, position, duration, toggle, next, prev } = usePlayer();
  if (!song) return null;

  return (
    <div className="playerbar">
      <button className="playerbar-info" onClick={() => navigate("/now-playing")} aria-label="Open player">
        <Cover id={song.id} uri={song.cover_url} size={44} radius={10} />
        <span className="song-text">
          <span className="song-title">{song.title}</span>
          <span className="song-sub">{song.artist_name}</span>
        </span>
      </button>
      <div className="playerbar-controls">
        <button className="icon-btn hide-sm" onClick={prev} aria-label="Previous song">
          <Icon name="prev" />
        </button>
        <button className="play-btn small" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} size={20} />
        </button>
        <button className="icon-btn" onClick={next} aria-label="Next song">
          <Icon name="next" />
        </button>
      </div>
      <div className="playerbar-progress" aria-hidden="true">
        <div style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/** App chrome: sidebar on wide screens, bottom tabs on phones, mini player above both. */
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
          <b>Music</b>
        </div>
        <Tabs className="side-tabs" />
        <div className="sidebar-foot">
          <a className="btn" href={APK_URL}>
            <Icon name="download" size={18} /> Android app
          </a>
          <span className="muted">{user?.name}</span>
          <button className="btn ghost" onClick={logout}>
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
