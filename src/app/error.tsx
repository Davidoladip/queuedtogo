"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const offline = /fetch failed|network|ECONN|ENOTFOUND/i.test(error.message);
  return (
    <div className="auth-shell wrap">
      <main className="auth-card" role="alert">
        <h1>{offline ? "We can't reach the service right now" : "Something went wrong"}</h1>
        <p className="muted">{offline ? "Check your connection and try again in a moment." : "Try again. If it keeps happening, let us know."}</p>
        <button className="btn primary block" onClick={reset}>Try again</button>
      </main>
    </div>
  );
}
