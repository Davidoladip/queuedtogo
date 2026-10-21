export default function Loading() {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="spinner" />
      <span>Loading…</span>
    </div>
  );
}
