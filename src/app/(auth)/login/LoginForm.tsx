"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(signIn, initialState);
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <Link href="/forgot-password" style={{ fontSize: 13.5, alignSelf: "flex-end", marginTop: -6 }}>Forgot your password?</Link>
      <SubmitButton className="btn primary block" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
