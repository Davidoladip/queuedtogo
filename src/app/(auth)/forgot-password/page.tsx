"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, initialState);
  return (
    <>
      <div>
        <h1>Reset your password</h1>
        <p className="muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      {state.message ? (
        <Notice tone="success">{state.message}</Notice>
      ) : (
        <form action={action} className="form" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
          <SubmitButton className="btn primary block" pendingText="Sending…">Send reset link</SubmitButton>
        </form>
      )}
      <div className="ticket-edge" />
      <p className="auth-foot"><Link href="/login">Back to sign in</Link></p>
    </>
  );
}
