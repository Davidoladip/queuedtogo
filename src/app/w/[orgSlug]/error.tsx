"use client";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel empty" role="alert">
      <b>This page didn&apos;t load</b>
      <span>{/fetch failed|network/i.test(error.message) ? "We couldn't reach the database. Check your connection." : "Something went wrong on our side."}</span>
      <button className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
