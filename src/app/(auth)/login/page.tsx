import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/urls";
import { Notice } from "@/components/ui/Notice";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUser()) redirect(next);
  return (
    <AuthShell panel="signin">
      <div>
        <h1>Sign in</h1>
        <p className="au-lede">Welcome back. Your orders are waiting.</p>
      </div>
      {sp.error === "link" && <Notice tone="error">That link has expired or was already used. Sign in below, or ask for a new link.</Notice>}
      {sp.signed_out && <Notice tone="success">You&apos;ve signed out. See you at the next event.</Notice>}
      <LoginForm next={next} />
      <p className="au-switch">
        New to QueuedToGo? <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create a free account</Link>
      </p>
    </AuthShell>
  );
}
