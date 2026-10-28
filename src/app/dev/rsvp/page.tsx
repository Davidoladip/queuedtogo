import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { sampleRsvpForm } from "./sample";
import { DemoRsvpForm } from "./DemoRsvpForm";
import { FormRenderer } from "@/components/form/FormRenderer";

/** Development harness: an RSVP form. ?full=1 puts new yeses on the waitlist; ?closed=1 shows the closed message. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevRsvpPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const form = sampleRsvpForm();
  if (sp.nomaybe === "1") form.fields[2].options[2] = "";
  return (
    <div className="pf-page">
      {sp.closed === "1"
        ? <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" closedMessage="RSVPs for this event have closed." />
        : <DemoRsvpForm form={form} full={sp.full === "1"} />}
    </div>
  );
}
