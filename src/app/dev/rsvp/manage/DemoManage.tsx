"use client";

import { RsvpManage } from "@/components/rsvp/RsvpManage";
import type { FormModel } from "@/lib/design/engine";

/** Development harness: the change-RSVP page with a pretend save (room for 4 more people). */
export function DemoManage({ form, closed, canChange }: { form: FormModel; closed: boolean; canChange: boolean }) {
  return (
    <RsvpManage form={form} assetBase="/dev/assets" businessName="Demo Business" name="Ava Stone" initial={{ status: "yes", party: 2, waitlisted: false }}
      canChange={canChange} closed={closed} past={false} googleUrl="https://calendar.google.com/calendar/render?action=TEMPLATE" icsUrl="/dev/rsvp/manage.ics" contact="hello@demo.example"
      onSave={async (status, party) => {
        await new Promise((r) => setTimeout(r, 120));
        if (closed && status !== "no" && party > 2) return { ok: false, error: "RSVPs for this event have closed, so you can only cancel or lower your numbers." };
        if (status === "yes" && party > 4) return { ok: false, error: "There's only room for 4 in your party right now." };
        return { ok: true, status, party: status === "no" ? 0 : party, waitlisted: false };
      }} />
  );
}
