"use client";

import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormModel } from "@/lib/design/engine";
import { checkSubmission } from "@/lib/submission";
import { DEMO_BUSINESS } from "@/lib/demo";

/** A demo form: checks answers exactly like a real form, then shows the real thank-you screen. Nothing is saved or sent. */
export function DemoForm({ form, assetBase }: { form: FormModel; assetBase: string }) {
  return (
    <FormRenderer form={form} assetBase={assetBase} mode="live" businessName={DEMO_BUSINESS} version={1}
      onSubmitOrder={async (fd) => {
        await new Promise((r) => setTimeout(r, 300));
        const c = checkSubmission(form, fd);
        if (!c.ok) return { ok: false, message: c.message, errors: c.errors };
        if (c.rsvp) return { ok: true, rsvp: { status: c.rsvp.status, waitlisted: false, party: c.rsvp.party, name: c.customer.name, manageUrl: null, icsUrl: null, googleUrl: null } };
        return { ok: true, number: 1042, trackingUrl: `${location.origin}/demo/track` };
      }} />
  );
}
