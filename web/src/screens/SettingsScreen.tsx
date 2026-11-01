import { useState } from "react";
import { Icon } from "../components/Icon";
import { GENRES } from "../data/genres";
import { LANGUAGES } from "../data/languages";
import { TASTES } from "../data/tastes";
import { useAuth } from "../store/auth";
import { usePlayer } from "../store/player";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDob(v?: string | null): string {
  if (!v) return "Not set";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}` : v;
}

export function SettingsScreen() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const updatePreferences = useAuth((s) => s.updatePreferences);

  const [editing, setEditing] = useState(false);
  const [gender, setGender] = useState<"male" | "female" | null>(user?.gender ?? null);
  const [tastes, setTastes] = useState<string[]>(user?.song_tastes ?? []);
  const [dob, setDob] = useState<string>(user?.date_of_birth ?? "");
  const [genres, setGenres] = useState<string[]>(user?.genres ?? []);
  const [languages, setLanguages] = useState<string[]>(user?.languages ?? []);
  const boost = usePlayer((s) => s.boost);
  const setBoost = usePlayer((s) => s.setBoost);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!user?.is_admin;
  const changes = user?.taste_changes ?? 0;
  const locked = changes >= 2;

  const startEdit = () => {
    setGender(user?.gender ?? null);
    setTastes(user?.song_tastes ?? []);
    setDob(user?.date_of_birth ?? "");
    setGenres(user?.genres ?? []);
    setLanguages(user?.languages ?? []);
    setEditing(true);
    setSavedMessage(false);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const toggleTaste = (key: string) => {
    if (locked) return;
    setTastes((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  };

  const toggleGenre = (key: string) => {
    setGenres((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]));
  };

  const toggleLanguage = (key: string) => {
    setLanguages((prev) => (prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key]));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const current = user?.song_tastes ?? [];
      const tastesChanged = !locked && (tastes.length !== current.length || tastes.some((t) => !current.includes(t)));
      const dobChanged = !!dob && dob !== (user?.date_of_birth ?? "");

      await updatePreferences({
        gender: gender ?? undefined,
        ...(tastesChanged ? { songTastes: tastes } : {}),
        ...(dobChanged ? { dateOfBirth: dob } : {}),
        genres,
        languages,
      });

      setEditing(false);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const handleVolumeChange = (pct: number) => {
    setBoost(pct);
  };

  const confirmLogout = () => {
    if (confirm("Log out? You will need to log in again to listen.")) {
      logout();
    }
  };

  return (
    <div className="page wide settings-page">
      <header className="page-head settings-header">
        <div>
          <div className="settings-title-row">
            <span className="settings-logo-badge">
              <Icon name="settings" size={24} />
            </span>
            <h1>Settings & Preferences</h1>
          </div>
          <p className="muted">Manage your profile, music tastes, playback options, and system settings.</p>
        </div>

        {!editing ? (
          <button className="btn primary edit-pref-btn" onClick={startEdit}>
            <Icon name="edit" size={18} /> Edit Preferences
          </button>
        ) : (
          <div className="row">
            <button className="btn ghost" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </header>

      {savedMessage && <div className="notice-banner success">Preferences updated successfully!</div>}
      {error && <div className="notice-banner error">{error}</div>}

      {/* Account & Profile Card */}
      <section className="settings-card profile-card">
        <div className="profile-card-left">
          <div className="avatar-lg">
            {user?.gender ? (
              <Icon name={user.gender} size={36} />
            ) : (
              (user?.name ?? "?").trim().charAt(0).toUpperCase()
            )}
          </div>
          <div className="profile-details">
            <div className="row">
              <h2>{user?.name ?? "Listener"}</h2>
              {isAdmin && <span className="badge admin-badge">Admin</span>}
            </div>
            <p className="muted">{user?.email}</p>
            <p className="profile-sub">
              Birthday: <b>{formatDob(user?.date_of_birth)}</b> · Gender: <b>{user?.gender ?? "Not specified"}</b>
            </p>
          </div>
        </div>

        <button className="btn danger-outline" onClick={confirmLogout}>
          <Icon name="logout" size={18} /> Log out
        </button>
      </section>

      {/* Editing Gender & DOB */}
      {editing && (
        <section className="settings-card">
          <h3>Personal Details</h3>
          <div className="settings-grid-2">
            <div className="field">
              <label>Date of Birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="field">
              <label>Gender</label>
              <div className="row">
                <button
                  type="button"
                  className={`chip ${gender === "male" ? "active" : ""}`}
                  onClick={() => setGender("male")}
                  aria-pressed={gender === "male"}
                >
                  <Icon name="male" size={16} /> Male
                </button>
                <button
                  type="button"
                  className={`chip ${gender === "female" ? "active" : ""}`}
                  onClick={() => setGender("female")}
                  aria-pressed={gender === "female"}
                >
                  <Icon name="female" size={16} /> Female
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Language Preferences */}
      <section className="settings-card">
        <div className="section-header">
          <div>
            <h3>Languages</h3>
            <p className="muted">Your top language shapes music discovery, trending lists, and YouTube recommendations.</p>
          </div>
        </div>
        <div className="chips-grid">
          {LANGUAGES.map((lang) => {
            const isSelected = editing ? languages.includes(lang.key) : (user?.languages ?? []).includes(lang.key);
            return (
              <button
                key={lang.key}
                type="button"
                className={`chip ${isSelected ? "active" : ""}`}
                onClick={() => (editing ? toggleLanguage(lang.key) : undefined)}
                disabled={!editing}
                aria-pressed={isSelected}
              >
                {isSelected && <Icon name="check" size={16} />}
                {lang.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Music Tastes & Moods */}
      <section className="settings-card">
        <div className="section-header">
          <div>
            <h3>Music Tastes</h3>
            <p className="muted">
              Choose the vibe that matches your listening style. {locked ? "(Taste changes limit reached: 2/2)" : `(Changes remaining: ${2 - changes})`}
            </p>
          </div>
        </div>
        <div className="chips-grid">
          {TASTES.map((taste) => {
            const isSelected = editing ? tastes.includes(taste.key) : (user?.song_tastes ?? []).includes(taste.key);
            return (
              <button
                key={taste.key}
                type="button"
                className={`chip ${isSelected ? "active" : ""}`}
                onClick={() => (editing ? toggleTaste(taste.key) : undefined)}
                disabled={!editing || locked}
                aria-pressed={isSelected}
              >
                {isSelected && <Icon name="check" size={16} />}
                {taste.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Genres */}
      <section className="settings-card">
        <div className="section-header">
          <div>
            <h3>Favorite Genres</h3>
            <p className="muted">Select genres to personalize your song mix and discover playlists.</p>
          </div>
        </div>
        <div className="chips-grid">
          {GENRES.map((genre) => {
            const isSelected = editing ? genres.includes(genre.key) : (user?.genres ?? []).includes(genre.key);
            return (
              <button
                key={genre.key}
                type="button"
                className={`chip ${isSelected ? "active" : ""}`}
                onClick={() => (editing ? toggleGenre(genre.key) : undefined)}
                disabled={!editing}
                aria-pressed={isSelected}
              >
                {isSelected && <Icon name="check" size={16} />}
                {genre.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Audio & Volume Boost */}
      <section className="settings-card">
        <div className="section-header">
          <div>
            <h3>Audio Volume Boost</h3>
            <p className="muted">Enhance playback loudness above default system output.</p>
          </div>
        </div>
        <div className="vol-boost-options">
          {[
            { label: "Normal (100%)", pct: 100 },
            { label: "Boosted (125%)", pct: 125 },
            { label: "High Boost (150%)", pct: 150 },
            { label: "Max Boost (200%)", pct: 200 },
          ].map((opt) => (
            <button
              key={opt.pct}
              type="button"
              className={`vol-boost-btn ${boost === opt.pct ? "active" : ""}`}
              onClick={() => handleVolumeChange(opt.pct)}
            >
              <Icon name="volume" size={20} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Admin Panel Link & Tools (Only shown for Admin users) */}
      {isAdmin && (
        <section className="settings-card admin-section">
          <div className="section-header">
            <div className="row">
              <Icon name="shield" size={24} className="accent-color" />
              <h3>Admin Management Tools</h3>
            </div>
            <span className="badge admin-badge">Authorized Admin</span>
          </div>
          <p className="muted">
            You are logged in with administrator privileges. Access the deployed admin dashboard and backend services:
          </p>

          <div className="admin-tools-grid">
            <a
              href="https://admin.deploymentportal.in"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-tool-card"
            >
              <div className="admin-tool-info">
                <h4>Open Admin Dashboard</h4>
                <p className="muted">Manage user activities, active accounts, database stats, and uploads.</p>
              </div>
              <Icon name="external" size={20} />
            </a>

            <a
              href="https://admin.deploymentportal.in/#/import"
              target="_blank"
              rel="noopener noreferrer"
              className="admin-tool-card"
            >
              <div className="admin-tool-info">
                <h4>AI Video Import & Catalogue</h4>
                <p className="muted">Import trending Telugu and regional music tracks with automated tags.</p>
              </div>
              <Icon name="sparkles" size={20} />
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
