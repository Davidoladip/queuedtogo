"use client";

import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormModel } from "@/lib/design/engine";
import { checkSubmission } from "@/lib/submission";

/** Development harness: runs the server's answer checks in the browser and pretends to save the RSVP. */
export function DemoRsvpForm({ form, full }: { form: FormModel; full: boolean }) {
  return (
    <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" version={1}
      onSubmitOrder={async (fd) => {
        await new Promise((r) => setTimeout(r, 150));
        const c = checkSubmission(form, fd);
        if (!c.ok) return { ok: false, message: c.message, errors: c.errors };
        if (!c.rsvp) return { ok: false, message: "No RSVP answer." };
        (window as unknown as { __lastRsvp: unknown }).__lastRsvp = { rsvp: c.rsvp, customer: c.customer, consent: c.consent, answers: c.answers };
        const base = `${location.origin}/dev/rsvp/manage`;
        return { ok: true, rsvp: { status: c.rsvp.status, waitlisted: full && c.rsvp.status === "yes", party: c.rsvp.party, name: c.customer.name,
          manageUrl: form.settings.rsvp.allowChange ? base : null, icsUrl: `${base}.ics`, googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE" } };
      }} />
  );
}
