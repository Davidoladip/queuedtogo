import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { AuthShell } from "@/components/auth/AuthShell";
import { CheckInbox } from "@/app/(auth)/signup/SignupForm";

/** Development harness: the "check your inbox" screen shown after sign-up. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevCheckInbox() {
  await connection();
  if (!harnessEnabled()) notFound();
  return (
    <AuthShell panel="signup">
      <CheckInbox email="alice@example.com" next="/onboarding" loginHref="/login" />
    </AuthShell>
  );
}
