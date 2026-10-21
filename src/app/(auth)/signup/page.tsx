import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/urls";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/onboarding");
  if (await getUser()) redirect(next);
  return (
    <>
      <div>
        <h1>Create your account</h1>
        <p className="muted">Then set up your business and your first event form.</p>
      </div>
      <SignupForm next={next} />
      <div className="ticket-edge" />
      <p className="auth-foot">
        Already have an account? <Link href={`/login${next !== "/onboarding" ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link>
      </p>
    </>
  );
}
