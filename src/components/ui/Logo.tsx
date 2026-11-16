import Image from "next/image";
import Link from "next/link";

/** QueuedToGo logo: the green arrow with the Q, and the name. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="QueuedToGo home">
      <Image className="brand-mark" src="/brand/queuedtogo-mark.png" alt="" width={81} height={32} priority unoptimized />
      <span className="brand-name">Queued<span>ToGo</span></span>
    </Link>
  );
}
