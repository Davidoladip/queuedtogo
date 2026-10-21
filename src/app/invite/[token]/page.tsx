import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";
import { AcceptInvite } from "./AcceptInvite";

export const metadata: Metadata = { title: "Join a business" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  const here = `/invite/${token}`;

  let body: React.ReactNode;
  if (!user) {
    body = (
      <>
        <h1>You&apos;ve been invited</h1>
        <p className="muted">Sign in or create an account with the email address the invitation was sent to.</p>
        <div className="row">
          <Link className="btn primary block" href={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link>
          <Link className="btn block" href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link>
        </div>
      </>
    );
  } else {
    const supabase = await createClient();
    const { data } = /^[0-9a-f]{64}$/.test(token) ? await supabase.rpc("get_invitation", { p_token: token }) : { data: null };
    const inv = data?.[0];
    if (!inv) body = <Notice tone="error">This invitation link is not valid. Ask the person who invited you for a new one.</Notice>;
    else if (inv.accepted) body = <Notice tone="info">This invitation has already been used. <Link href={`/w/${inv.org_slug}`}>Open {inv.org_name}</Link></Notice>;
    else if (new Date(inv.expires_at) < new Date()) body = <Notice tone="error">This invitation has expired. Ask {inv.org_name} for a new one.</Notice>;
    else if (!inv.email_matches)
      body = (
        <Notice tone="error">
          This invitation was sent to {inv.email}, but you are signed in as {user.email}. Sign out and sign in with {inv.email}.
        </Notice>
      );
    else
      body = (
        <>
          <h1>Join {inv.org_name}</h1>
          <p className="muted">You&apos;ll join as {inv.role === "admin" ? "an admin" : "a member"}.</p>
          <AcceptInvite token={token} orgName={inv.org_name} />
        </>
      );
  }

  return (
    <div className="auth-shell wrap">
      <main className="auth-card">
        <Logo />
        {body}
      </main>
    </div>
  );
}
