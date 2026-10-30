"use client";

import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormModel } from "@/lib/design/engine";
import { submitOrder } from "@/server/actions/submit";

/** The customer-facing form, sending orders through the server (never straight to the database). */
export function PublicOrderForm({ form, orgSlug, formSlug, orgName, assetBase, version, orderingOn, closedMessage, rsvpTexts }: {
  form: FormModel; orgSlug: string; formSlug: string; orgName: string; assetBase: string; version: number | undefined;
  orderingOn: boolean; closedMessage: string | null; rsvpTexts: boolean;
}) {
  return (
    <FormRenderer
      form={form}
      assetBase={assetBase}
      mode="live"
      businessName={orgName}
      closedMessage={closedMessage}
      rsvpTexts={rsvpTexts}
      version={version}
      onSubmitOrder={orderingOn ? (fd) => submitOrder(orgSlug, formSlug, fd) : undefined}
    />
  );
}
