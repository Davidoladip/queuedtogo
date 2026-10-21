import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="auth-shell wrap">
      <main className="auth-card">
        <Logo />
        <h1>We couldn&apos;t find that page</h1>
        <p className="muted">The link may be wrong, or you may not have access to it. If someone shared it with you, check you&apos;re signed in with the right account.</p>
        <Link href="/" className="btn primary block">Go to your businesses</Link>
      </main>
    </div>
  );
}
