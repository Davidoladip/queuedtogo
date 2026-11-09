import Link from "next/link";

/** Not found inside a business (a job, form or page that doesn't exist or was deleted). Keeps the app's own layout. */
export default function WorkspaceNotFound() {
  return (
    <div className="empty" style={{ paddingBlock: 64 }}>
      <b>We couldn&apos;t find that</b>
      <p>It may have been deleted, or the link may be wrong.</p>
      <Link href="/" className="btn">Back to your businesses</Link>
    </div>
  );
}
