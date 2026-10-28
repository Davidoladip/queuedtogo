import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { assetBaseFor } from "@/lib/design/engine";
import { deadlinePassed, googleCalendarUrl, localToday } from "@/lib/rsvp";
import { calendarFor, loadRsvpByToken } from "@/lib/rsvp-data";
import { siteUrl } from "@/lib/urls";
import { RsvpManage } from "@/components/rsvp/RsvpManage";
import { updateRsvp } from "@/server/actions/rsvp";

export const metadata: Metadata = { title: "Your RSVP", robots: { index: false, follow: false } };

/** A guest's RSVP, from the private link in their confirmation: see it, change it, add it to a calendar. */
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await loadRsvpByToken(token);
  if (!g) notFound();
  const base = `${await siteUrl()}/r/${g.token}`;
  const cal = calendarFor(g, base);
  const s = g.form.settings.rsvp;
  const past = !!g.form.eventDate && g.form.eventDate < localToday(g.org.timezone);
  const save = async (status: "yes" | "no" | "maybe", party: number) => {
    "use server";
    return updateRsvp(token, status, party);
  };
  return (
    <div className="pf-page">
      <RsvpManage
        form={g.form}
        assetBase={assetBaseFor(env.supabaseUrl)}
        businessName={g.org.name}
        name={g.name}
        initial={{ status: g.status, party: g.party, waitlisted: g.waitlisted }}
        canChange={s.allowChange}
        closed={g.formStatus !== "live" || deadlinePassed(s, g.org.timezone)}
        past={past}
        googleUrl={cal ? googleCalendarUrl(cal) : null}
        icsUrl={cal ? `${base}/calendar.ics` : null}
        contact={g.org.replyTo}
        onSave={save}
      />
    </div>
  );
}
