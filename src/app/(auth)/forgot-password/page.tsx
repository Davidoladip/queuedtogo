"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, initialState);
  return (
    <AuthShell panel="reset">
      <div>
        <h1>Reset your password</h1>
        <p className="au-lede">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      </div>
      {state.message ? (
        <div className="au-sent" role="status">
          <Notice tone="success">{state.message}</Notice>
          <ul className="au-tips"><li>Not there in a minute? Check your spam or promotions folder.</li></ul>
        </div>
      ) : (
        <form action={action} className="form" noValidate>
          {state.error && <Notice tone="error">{state.error}</Notice>}
          <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
          <SubmitButton className="btn primary block" pendingText="Sending…">Send reset link</SubmitButton>
        </form>
      )}
      <p className="au-switch">Remembered it? <Link href="/login">Back to sign in</Link></p>
    </AuthShell>
  );
}
