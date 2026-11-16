"use client";

import { useCallback, useRef } from "react";
import { FormRenderer } from "@/components/form/FormRenderer";
import { BotCheck } from "@/components/ui/BotCheck";
import type { FormModel } from "@/lib/design/engine";
import { submitOrder } from "@/server/actions/submit";

/** The customer-facing form, sending orders through the server (never straight to the database). */
export function PublicOrderForm({ form, orgSlug, formSlug, orgName, assetBase, version, orderingOn, closedMessage, rsvpTexts, freePlan }: {
  form: FormModel; orgSlug: string; formSlug: string; orgName: string; assetBase: string; version: number | undefined;
  orderingOn: boolean; closedMessage: string | null; rsvpTexts: boolean; freePlan: boolean;
}) {
  const bot = useRef<{ token: () => string; reset: () => void } | null>(null);
  const onReady = useCallback((api: { token: () => string; reset: () => void }) => { bot.current = api; }, []);
  const send = async (fd: FormData) => {
    const token = bot.current?.token();
    if (token) fd.set("cf-turnstile-response", token);
    try {
      return await submitOrder(orgSlug, formSlug, fd);
    } finally {
      bot.current?.reset(); // a token works once
    }
  };
  const reportHref = `mailto:hello@threadtogo.com?subject=${encodeURIComponent(`Report a form: /f/${orgSlug}/${formSlug}`)}&body=${encodeURIComponent("Tell us what's wrong with this form:\n\n")}`;
  return (
    <>
      <FormRenderer
        form={form}
        assetBase={assetBase}
        mode="live"
        businessName={orgName}
        closedMessage={closedMessage}
        rsvpTexts={rsvpTexts}
        version={version}
        onSubmitOrder={orderingOn ? send : undefined}
      />
      {orderingOn && <div className="pf-bot"><BotCheck onReady={onReady} /></div>}
      {freePlan && (
        <p className="pf-made">
          Made with <a href="/" target="_blank" rel="noopener">QueuedToGo</a> · <a href={reportHref}>Report this form</a>
        </p>
      )}
    </>
  );
}
