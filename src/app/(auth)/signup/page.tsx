import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/urls";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create an account" };

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
