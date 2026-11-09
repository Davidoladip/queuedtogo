"use client";

import { useActionState } from "react";
import { updatePassword } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PasswordField } from "@/components/auth/PasswordField";

export function ResetForm() {
  const [state, action] = useActionState(updatePassword, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <PasswordField label="New password" name="password" autoComplete="new-password" required minLength={8} rule error={state.fieldErrors?.password} />
      <PasswordField label="Type it again" name="confirm" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton className="btn primary block" pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
