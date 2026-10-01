import { FormEvent, useState } from "react";
import { Icon } from "../components/Icon";
import { PasswordInput } from "../components/PasswordInput";
import { DownloadApp } from "../components/DownloadApp";
import { useAuth } from "../store/auth";

const FEATURES = [
  "Stream your whole library, anywhere",
  "Build playlists and like your favourites",
  "Pick up on the web or the Android app",
];

export function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email")).trim();
    const password = String(fd.get("password"));
    setError(null);
    setBusy(true);
    try {
      if (isLogin) await login(email, password);
      else await register(String(fd.get("name")).trim(), email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-split">
      <section className="auth-hero" aria-hidden="false">
        <div className="brand">
          <span className="logo">
            <Icon name="play" size={18} />
          </span>
          <b>Music</b>
        </div>

        <div className="hero-copy">
          <h2 className="hero-title">Your music, everywhere.</h2>
          <ul className="hero-list">
            {FEATURES.map((f) => (
              <li key={f}>
                <span className="tick" aria-hidden="true">
                  <Icon name="play" size={10} />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <DownloadApp className="btn primary hero-download">
            <Icon name="download" size={20} /> Download the Android app
          </DownloadApp>
        </div>

        <div className="hero-art" aria-hidden="true">
          <span className="disc d1" />
          <span className="disc d2" />
          <span className="disc d3" />
        </div>
      </section>

      <main className="auth-panel">
        <div className="auth-card">
          <h1>{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="muted">{isLogin ? "Log in to pick up where you left off." : "It only takes a moment."}</p>

          <form onSubmit={submit} className="stack">
            {!isLogin && (
              <label className="field">
                <span>Name</span>
                <input name="name" required autoComplete="name" placeholder="Your name" />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            </label>
            <label className="field">
              <span>Password</span>
              <PasswordInput
                name="password"
                minLength={isLogin ? 1 : 8}
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder={isLogin ? "Your password" : "At least 8 characters"}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary wide" disabled={busy}>
              {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
            </button>
          </form>

          <DownloadApp className="apk-link">
            <Icon name="download" size={18} /> Get the Android app
          </DownloadApp>

          <p className="switch">
            <span className="muted">{isLogin ? "New here?" : "Already have an account?"}</span>
            <button
              className="link"
              onClick={() => {
                setError(null);
                setMode(isLogin ? "register" : "login");
              }}
            >
              {isLogin ? "Create an account" : "Log in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
