import { useEffect, useRef, useState } from "react";
import { request } from "../api/http";
import { useAuth } from "../store/auth";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/** "Continue with Google". Renders nothing until the server reports a Google client ID. */
export function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);
  const [clientId, setClientId] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    request<{ googleClientId: string | null }>("/auth/config")
      .then((c) => setClientId(c.googleClientId))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const render = () => {
      const el = holder.current;
      if (cancelled || !el || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => loginWithGoogle(r.credential).catch((e: Error) => onError(e.message)),
      });
      window.google.accounts.id.renderButton(el, {
        theme: "filled_black",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: Math.min(el.offsetWidth || 352, 400),
      });
    };

    if (window.google) render();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
    };
  }, [clientId, loginWithGoogle, onError]);

  if (!clientId) return null;
  return (
    <>
      <div className="divider">
        <span>or</span>
      </div>
      <div ref={holder} className="google-btn" />
    </>
  );
}
