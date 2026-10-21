"use client";

import { useActionState } from "react";
import { updatePassword } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function ResetForm() {
  const [state, action] = useActionState(updatePassword, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." error={state.fieldErrors?.password} />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton className="btn primary block" pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
