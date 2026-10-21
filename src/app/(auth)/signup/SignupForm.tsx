"use client";

import { useActionState } from "react";
import { signUp } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, initialState);
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="next" value={next} />
      <Field label="Your name" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} error={state.fieldErrors?.fullName} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." error={state.fieldErrors?.password} />
      <SubmitButton className="btn primary block" pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
