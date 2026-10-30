import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../sample";
import { blankField } from "@/lib/design/engine";
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
  if (sp.cover === "1") form.settings.cover = { ...form.settings.cover, on: true, text: "Join us for {form_title}.\nFood, music and the new collection." };
  if (sp.texts === "1") {
    form.settings.rsvp.texts = true;
    const phone = blankField("phone"); phone.id = "a0000000-0000-4000-8000-000000000006"; phone.label = "Mobile number";
    form.fields.splice(form.fields.length - 1, 0, phone);
  }
  return (
    <div className="pf-page">
      {sp.closed === "1"
        ? <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" closedMessage="RSVPs for this event have closed." />
        : <DemoRsvpForm form={form} full={sp.full === "1"} />}
    </div>
  );
}
