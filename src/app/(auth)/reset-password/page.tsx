import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = await requireUser("/reset-password");
  return (
    <>
      <div>
        <h1>Choose a new password</h1>
        <p className="muted">For {user.email}</p>
      </div>
      <ResetForm />
    </>
  );
}
