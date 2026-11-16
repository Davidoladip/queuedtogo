"use client";

import { useEffect, useRef } from "react";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScript() {
  if (typeof document === "undefined" || document.querySelector(`script[src="${SRC}"]`)) return;
  const s = document.createElement("script");
  s.src = SRC;
  s.async = true;
  document.head.appendChild(s);
}

/**
 * Cloudflare Turnstile: an invisible check that a person, not a bot, is sending the form. Most people never see
 * anything; a suspicious visitor gets a one-click box. Adds a hidden "cf-turnstile-response" field to the form
 * it sits in. Renders nothing until the site key is set. Pass `resetKey` (e.g. the form's server state) to get a
 * fresh token after each try.
 */
export function BotCheck({ onReady, resetKey }: { onReady?: (api: { token: () => string; reset: () => void }) => void; resetKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY) return;
    loadScript();
    let id: string | undefined;
    let stopped = false;
    const tryRender = () => {
      if (stopped) return;
      const t = window.turnstile;
      if (!t || !ref.current) { setTimeout(tryRender, 150); return; }
      id = t.render(ref.current, { sitekey: SITE_KEY, appearance: "interaction-only", size: "flexible", theme: "auto", "response-field-name": "cf-turnstile-response" });
      onReady?.({
        token: () => (ref.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? ""),
        reset: () => { if (id !== undefined) window.turnstile?.reset(id); },
      });
    };
    tryRender();
    return () => { stopped = true; if (id !== undefined) window.turnstile?.remove(id); };
  }, [onReady, resetKey]); // a token works once: a new one after every reply from the server
  if (!SITE_KEY) return null;
  return <div ref={ref} className="bot-check" />;
}
