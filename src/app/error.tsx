"use client";

import { AuthShell } from "@/components/auth/AuthShell";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = /fetch failed|network|ECONN|ENOTFOUND/i.test(error.message);
  return (
    <AuthShell>
      <div role="alert">
        <h1>{offline ? "We can't reach the service right now" : "Something went wrong"}</h1>
        <p className="au-lede">{offline ? "Check your connection and try again in a moment." : "Try again. If it keeps happening, email us and we'll look into it."}</p>
      </div>
      <button className="btn primary block" onClick={reset}>Try again</button>
    </AuthShell>
  );
}
