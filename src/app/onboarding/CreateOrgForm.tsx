"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createOrganization } from "@/server/actions/organizations";
import { initialState } from "@/lib/validation/form-state";
import { slugify } from "@/lib/validation/org";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";

export function CreateOrgForm() {
  const [state, action] = useActionState(createOrganization, initialState);
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(state.values?.slug));
  return (
    <form action={action} className="form" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field
        label="Business name"
        name="name"
        required
        value={name}
        placeholder="e.g. Threadtogo"
        onChange={(e) => {
          setName(e.target.value);
          if (!slugTouched) setSlug(slugify(e.target.value));
        }}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Workspace address"
        name="slug"
        required
        prefix="queuedtogo.com/f/"
        value={slug}
        onChange={(e) => {
          setSlugTouched(true);
          setSlug(e.target.value.toLowerCase());
        }}
        hint="Used in your form links. Lowercase letters, numbers and dashes."
        error={state.fieldErrors?.slug}
      />
      <p className="muted" style={{ fontSize: 13 }}>Set up for the United States: Eastern time and US dollars. You can change the time zone in Settings.</p>
      <div className="field">
        <label className="au-terms">
          <input type="checkbox" name="terms" required aria-describedby={state.fieldErrors?.terms ? "terms-err" : undefined} aria-invalid={state.fieldErrors?.terms ? true : undefined} />
          <span>
            I agree to the <Link href="/terms-of-service" target="_blank">Terms of Service</Link>, including the arbitration agreement and class
            action waiver in section 16, and I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link>.
          </span>
        </label>
        {state.fieldErrors?.terms && <span className="err" id="terms-err" role="alert">{state.fieldErrors.terms}</span>}
      </div>
      <SubmitButton className="btn primary block" pendingText="Creating…">Create business</SubmitButton>
    </form>
  );
}
