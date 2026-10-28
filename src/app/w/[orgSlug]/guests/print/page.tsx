import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/board";
import { loadGuests, loadRsvpForms } from "@/lib/guests-data";
import { GuestSheet } from "@/components/guests/GuestSheet";
import { PrintButton } from "@/components/event/PrintButton";

export const metadata: Metadata = { title: "Guest list" };

/** A printable door list: a tick box per guest, sorted by name. */
export default async function GuestPrintPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  if (!isUuid(sp.form)) notFound();
  const supabase = await createClient();
  const form = (await loadRsvpForms(supabase, org.id)).find((f) => f.id === sp.form);
  if (!form) notFound();
  const guests = await loadGuests(supabase, org.id, form.id);
  return (
    <>
      <div className="view-head no-print">
        <div>
          <Link href={`/w/${org.slug}/guests?form=${form.id}`} className="btn ghost small">← Guests</Link>
          <h1 style={{ marginTop: 8 }}>Guest list</h1>
          <p>Guests who said yes or maybe (not the waitlist), with a box to tick at the door.</p>
        </div>
        <PrintButton />
      </div>
      <GuestSheet title={form.title} eventDate={form.eventDate} business={org.name} guests={guests} />
    </>
  );
}
