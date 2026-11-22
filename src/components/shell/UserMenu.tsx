import Link from "next/link";
import { signOut } from "@/server/actions/auth";
import { initialsOf } from "@/lib/avatar";

export function UserMenu({ email, name, orgSlug, picture }: { email: string; name: string | null; orgSlug?: string; /** Public URL of their profile picture. */ picture?: string | null }) {
  const initials = initialsOf(name, email);
  return (
    <details className="menu">
      <summary className={`avatar avatar-btn${picture ? " has-img" : ""}`} aria-label="Account menu" title={email}>
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized image from our own storage */}
        {picture ? <img src={picture} alt="" width={72} height={72} decoding="async" draggable={false} /> : <span aria-hidden="true">{initials}</span>}
      </summary>
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
