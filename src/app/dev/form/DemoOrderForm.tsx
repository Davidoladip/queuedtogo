"use client";

import { useRef } from "react";
import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormModel } from "@/lib/design/engine";
import { checkSubmission } from "@/lib/submission";
import { quoteLines } from "@/lib/pricing";

/** Development harness: runs the server's answer checks in the browser and returns pretend order numbers. */
export function DemoOrderForm({ form, feeRate = 0 }: { form: FormModel; feeRate?: number }) {
  const n = useRef(1001);
  const keys = useRef(new Map<string, number>());
  return (
    <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" version={1} feeRate={feeRate}
      onSubmitOrder={async (fd) => {
        await new Promise((r) => setTimeout(r, 150));
        const c = checkSubmission(form, fd);
        if (!c.ok) return { ok: false, message: c.message, errors: c.errors };
        const k = String(fd.get("__k"));
        const num = keys.current.get(k) ?? n.current++;
        keys.current.set(k, num);
        // The server's own pricing of the answers (what would be charged), for the tests to compare with the screen.
        const quote = quoteLines(c.lines, feeRate, form.settings.pay.feePayer);
        (window as unknown as { __lastOrder: unknown }).__lastOrder = { answers: c.answers, customer: c.customer, consent: c.consent, title: c.title, summary: c.summary, quote };
        return { ok: true, number: num, trackingUrl: `${location.origin}/t/${"a".repeat(64)}` };
      }} />
  );
}
