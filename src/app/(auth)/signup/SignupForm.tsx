"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { resendConfirmation, signUp } from "@/server/actions/auth";
import { initialState } from "@/lib/validation/form-state";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PasswordField } from "@/components/auth/PasswordField";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, initialState);
  const loginHref = `/login${next !== "/onboarding" ? `?next=${encodeURIComponent(next)}` : ""}`;
  if (state.message) return <CheckInbox email={state.values?.email ?? ""} next={state.values?.next ?? next} loginHref={loginHref} />;
  return (
    <>
      <div>
        <h1>Create your account</h1>
        <p className="au-lede">Then set up your business and your first event form. It&apos;s free to start.</p>
      </div>
      <form action={action} className="form" noValidate>
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <input type="hidden" name="next" value={next} />
        <Field label="Your name" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} error={state.fieldErrors?.fullName} />
        <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
        <PasswordField label="Password" name="password" autoComplete="new-password" required minLength={8} rule error={state.fieldErrors?.password} />
        <SubmitButton className="btn primary block" pendingText="Creating your account…">Create account</SubmitButton>
        <p className="au-small">We&apos;ll only email you about your account. See our <Link href="/privacy">privacy policy</Link>.</p>
      </form>
      <p className="au-switch">Already have an account? <Link href={loginHref}>Sign in</Link></p>
    </>
  );
}

/** After sign-up: where the email went, what to do, and a way to send it again. */
export function CheckInbox({ email, next, loginHref }: { email: string; next: string; loginHref: string }) {
  const [state, action] = useActionState(resendConfirmation, initialState);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <div className="au-sent" role="status">
      <div className="au-env" aria-hidden="true" />
      <h1>Check your inbox</h1>
      <p className="au-lede" style={{ marginTop: 0 }}>We sent a confirmation link to <span className="au-addr">{email}</span>. Open it on this device to finish creating your account.</p>
      <ul className="au-tips">
        <li>It can take a minute to arrive.</li>
        <li>Not there? Check your spam or promotions folder.</li>
      </ul>
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <form action={(fd) => { setWait(60); return action(fd); }}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <SubmitButton className="btn block" pendingText="Sending…" disabled={wait > 0}>{wait > 0 ? `Send it again in ${wait}s` : "Send the link again"}</SubmitButton>
      </form>
      <p className="au-switch">Wrong address? <a href="/signup">Start again</a>. Already confirmed? <Link href={loginHref}>Sign in</Link></p>
    </div>
  );
}
