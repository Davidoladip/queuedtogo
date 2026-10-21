import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="QueuedToGo home">
      <span className="brand-name">Queued<span>ToGo</span></span>
    </Link>
  );
}
