"use client";

import { useActionState } from "react";
import { createForm } from "@/server/actions/forms";
import { initialState } from "@/lib/validation/form-state";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";

export function NewFormForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState(createForm, initialState);
  return (
    <form action={action} className="nf-form" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <div className="field">
        <label htmlFor="nf-title">New form for an event</label>
        <div className="nf-row">
          <input id="nf-title" name="title" placeholder="e.g. Harbourfront Food Fest" maxLength={140} defaultValue={state.values?.title}
            aria-invalid={state.fieldErrors?.title ? true : undefined} aria-describedby={state.fieldErrors?.title ? "nf-err" : undefined} />
          <SubmitButton pendingText="Creating…">Create form</SubmitButton>
        </div>
        {state.fieldErrors?.title && <span className="err" id="nf-err">{state.fieldErrors.title}</span>}
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}
