import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/urls";
import { Notice } from "@/components/ui/Notice";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getUser()) redirect(next);
  return (
    <>
      <div>
        <h1>Sign in</h1>
        <p className="muted">Welcome back. Your orders are waiting.</p>
      </div>
      {sp.error === "link" && <Notice tone="error">That link has expired or was already used. Sign in, or request a new link.</Notice>}
      {sp.signed_out && <Notice tone="success">You are signed out.</Notice>}
      <LoginForm next={next} />
      <div className="ticket-edge" />
      <p className="auth-foot">
        New to QueuedToGo? <Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
      </p>
    </>
  );
}
