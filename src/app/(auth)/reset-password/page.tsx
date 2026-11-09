import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await requireUser("/reset-password");
  return (
    <AuthShell panel="reset">
      <div>
        <h1>Choose a new password</h1>
        <p className="au-lede">For {user.email}</p>
      </div>
      <ResetForm />
    </AuthShell>
  );
}
