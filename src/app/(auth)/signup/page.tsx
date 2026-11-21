import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/urls";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create a free account", description: "Create a free QueuedToGo account: build a QR-code order form for your event, track every order on a production board and text customers when it's ready.", alternates: { canonical: "/signup" } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, "/onboarding");
  if (await getUser()) redirect(next);
  return (
    <AuthShell panel="signup">
      <SignupForm next={next} />
    </AuthShell>
  );
}
