"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Shown only once Google sign-in is set up in Supabase (NEXT_PUBLIC_GOOGLE_AUTH=on). */
export const googleAuthOn = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "on";
/** With the Google client ID, Google's own button signs in on queuedtogo.com ("to continue to queuedtogo.com"). */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GSI = "https://accounts.google.com/gsi/client";

type Gsi = {
  accounts: { id: {
    initialize: (o: Record<string, unknown>) => void;
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  } };
};
declare global { interface Window { google?: Gsi } }

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** "Continue with Google": Google confirms the email, so there's no confirmation link to wait for. */
export function GoogleButton({ next, label = "Continue with Google" }: { next: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const slot = useRef<HTMLDivElement>(null);
  const signup = label.toLowerCase().includes("sign up");

  useEffect(() => {
    if (!googleAuthOn || !CLIENT_ID) return;
    let stopped = false;
    if (!document.querySelector(`script[src="${GSI}"]`)) {
      const s = document.createElement("script");
      s.src = GSI; s.async = true;
      document.head.appendChild(s);
    }
    (async () => {
      // A fresh nonce per page: Google signs its hash into the token; Supabase checks it against the raw value.
      const raw = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const hashed = await sha256Hex(raw);
      const start = () => {
        if (stopped) return;
        const g = window.google;
        if (!g || !slot.current) { setTimeout(start, 150); return; }
        g.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: hashed,
          ux_mode: "popup",
          context: signup ? "signup" : "signin",
          use_fedcm_for_button: true,
          callback: async ({ credential }: { credential: string }) => {
            setBusy(true); setError(null);
            const { error: e } = await createClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
            if (e) { setBusy(false); setError("Google sign-in didn't finish. Try again, or use your email below."); return; }
            window.location.assign(next);
          },
        });
        g.accounts.id.renderButton(slot.current, {
          type: "standard", theme: "outline", size: "large", shape: "rectangular", logo_alignment: "center",
          text: signup ? "signup_with" : "continue_with", width: Math.min(400, Math.max(240, slot.current.offsetWidth || 400)),
        });
        setGsiReady(true);
      };
      start();
    })();
    return () => { stopped = true; };
  }, [next, signup]);

  if (!googleAuthOn) return null;

  // Fallback without the client ID: Supabase's redirect flow.
  const redirect = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`, queryParams: { prompt: "select_account" } },
    });
    if (e) { setBusy(false); setError("We couldn't reach Google. Try again, or use your email below."); }
  };

  return (
    <div className="au-google">
      {CLIENT_ID ? (
        <div className="au-gsi" aria-busy={busy || !gsiReady || undefined}>
          <div ref={slot} className="au-gsi-slot" />
          {busy && <p className="au-small" role="status">Signing you in…</p>}
        </div>
      ) : (
        <button type="button" className="btn block au-google-btn" onClick={redirect} disabled={busy} aria-busy={busy || undefined}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? "Opening Google…" : label}
        </button>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="au-or" role="separator"><span>or with email</span></div>
    </div>
  );
}
