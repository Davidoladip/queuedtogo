import Image from "next/image";
import Link from "next/link";

/** QueuedToGo logo: the name, followed by the green arrow with the Q. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="QueuedToGo home">
      <span className="brand-name">Queued<span>ToGo</span></span>
      <Image className="brand-mark" src="/brand/queuedtogo-mark.png" alt="" width={81} height={32} priority unoptimized />
    </Link>
  );
}
