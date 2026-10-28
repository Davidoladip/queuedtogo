import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadGuests, loadRsvpForms } from "@/lib/guests-data";
import { formatAnswer } from "@/lib/submission";
import { GuestList } from "@/components/guests/GuestList";
import { removeGuest, setCheckedIn } from "@/server/actions/guests";

export const metadata: Metadata = { title: "Guests" };

const fmt = (d: string | null) => (d ? new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "No date");

/** Guest lists for RSVP forms: totals, search, door check-in, CSV and a printable list. */
export default async function GuestsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const forms = await loadRsvpForms(supabase, org.id);
  const form = forms.find((f) => f.id === sp.form) ?? forms[0] ?? null;
  const base = `/w/${org.slug}/guests`;

  if (!form) {
    return (
      <div>
        <div className="view-head"><div><h1>Guests</h1><p>RSVP replies appear here.</p></div></div>
        <div className="panel" style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 18 }}>No RSVP forms yet</h2>
          <p className="muted" style={{ marginTop: 6 }}>Open a form, go to <b>Settings → Form type</b> and choose <b>An RSVP</b>. Guests can say yes, no or maybe, bring plus-ones, and change their reply later. Their replies show up on this page with door check-in.</p>
          <Link className="btn primary" href={`/w/${org.slug}/forms`} style={{ marginTop: 12 }}>Go to forms</Link>
        </div>
      </div>
    );
  }

  const guests = await loadGuests(supabase, org.id, form.id);
  const rows = guests.map(({ answers, ...g }) => ({
    ...g,
    notes: Object.values(answers).filter((a) => ["long", "choice", "multi", "dropdown"].includes(a.type) && a.value).map((a) => `${a.label}: ${formatAnswer(a)}`).join(" · ").slice(0, 200),
  }));
  const manage = canManage(org.role);
  const checkIn = async (id: string, on: boolean) => { "use server"; return setCheckedIn(orgSlug, id, on); };
  const remove = async (id: string) => { "use server"; return removeGuest(orgSlug, id); };

  return (
    <div>
      <div className="view-head">
        <div>
          <h1>Guests</h1>
          <p>{form.title} · {fmt(form.eventDate)}{form.status !== "live" ? ` · ${form.status === "closed" ? "closed" : "not published"}` : ""}</p>
        </div>
        {forms.length > 1 && (
          <form method="get" className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }} className="muted">Event
              <select name="form" defaultValue={form.id}>{forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}</select>
            </label>
            <button className="btn">Show</button>
          </form>
        )}
      </div>
      <GuestList key={form.id} guests={rows} capacity={form.capacity} canManage={manage} timeZone={org.timezone} checkIn={checkIn} remove={remove}
        exportHref={manage ? `${base}/export?form=${form.id}` : null} printHref={`${base}/print?form=${form.id}`} door={sp.door === "1"} />
    </div>
  );
}
