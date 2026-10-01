import { FormEvent, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../store/auth";

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
    <main className="auth">
      <span className="logo big">
        <Icon name="play" size={28} />
      </span>
      <h1>{isLogin ? "Your music, everywhere." : "Create your account."}</h1>
      <p className="muted">{isLogin ? "Log in to pick up where you left off." : "It only takes a moment."}</p>

      <form onSubmit={submit} className="stack">
        {!isLogin && (
          <label className="field">
            <span>Name</span>
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? 1 : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="At least 8 characters"
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
    </main>
  );
}
