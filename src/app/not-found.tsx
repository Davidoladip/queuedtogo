import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

export default function NotFound() {
  return (
    <AuthShell>
      <div>
        <h1>We couldn&apos;t find that page</h1>
        <p className="au-lede">The link may be wrong, or you may not have access to it. If someone shared it with you, check you&apos;re signed in with the right account.</p>
      </div>
      <div className="form">
        <Link href="/" className="btn primary block">Go to the homepage</Link>
        <Link href="/login" className="btn block">Sign in</Link>
      </div>
    </AuthShell>
  );
}
