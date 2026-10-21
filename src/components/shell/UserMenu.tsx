import Link from "next/link";
import { signOut } from "@/server/actions/auth";

export function UserMenu({ email, name, orgSlug }: { email: string; name: string | null; orgSlug?: string }) {
  const initials = (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <details className="menu">
      <summary className="avatar" aria-label="Account menu" title={email}>{initials}</summary>
      <div className="menu-pop">
        <div className="who"><b style={{ color: "var(--fg)" }}>{name || "Your account"}</b><br />{email}</div>
        {orgSlug && <Link href={`/w/${orgSlug}/settings#account`}>Account settings</Link>}
        <Link href="/onboarding">Create another business</Link>
        <hr />
        <form action={signOut}>
          <button type="submit" style={{ width: "100%" }}>Sign out</button>
        </form>
      </div>
    </details>
  );
}
