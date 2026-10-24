import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStages } from "@/lib/board-data";
import "@/components/event/event.css";

export const metadata: Metadata = { title: "Event day" };

export default async function EventDayPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [{ data: forms }, stages] = await Promise.all([
    supabase.from("forms").select("id, title").eq("org_id", org.id).order("created_at", { ascending: false }),
    loadStages(supabase, org.id),
  ]);
  const form = forms?.some((f) => f.id === sp.form) ? sp.form! : "";
  const stage = stages.some((s) => s.id === sp.stage) ? sp.stage! : "";
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(form ? { form } : {}), ...(stage ? { stage } : {}), ...extra });
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const base = `/w/${org.slug}/event`;

  return (
    <div className="qe">
      <div className="view-head">
        <div>
          <h1>Event day</h1>
          <p>Tools for the stand: find and hand over orders, print tickets and labels, see what to make, and export your orders.</p>
        </div>
      </div>
      <form className="qe-filter" method="get">
        <label>Form
          <select name="form" defaultValue={form}>
            <option value="">All forms</option>
            {forms?.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </label>
        <label>Stage (for printing)
          <select name="stage" defaultValue={stage}>
            <option value="">All open orders</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button className="btn">Apply</button>
      </form>
      <div className="qe-cards">
        <Link className="panel qe-card" href={`${base}/pickup${qs({})}`}><b>Pickup screen</b><span>Find an order by number, name or the last 4 digits of the phone, and mark it collected.</span></Link>
        <Link className="panel qe-card" href={`${base}/summary${qs({})}`}><b>Daily summary</b><span>Open jobs by stage, what&apos;s due or overdue, and how many of each item to make.</span></Link>
        <Link className="panel qe-card" href={`${base}/print${qs({ kind: "tickets" })}`}><b>Print order tickets</b><span>One ticket per order (4×6 in), with a QR code that opens the job.</span></Link>
        <Link className="panel qe-card" href={`${base}/print${qs({ kind: "labels" })}`}><b>Print labels</b><span>Order number, name and items on Avery 5160 / 8160 sheets (30 per page).</span></Link>
        {canManage(org.role)
          ? <a className="panel qe-card" href={`${base}/export${qs({})}`} download><b>Download orders (CSV)</b><span>Every order with customer details and answers, for Excel or Google Sheets.</span></a>
          : <div className="panel qe-card"><b>Download orders (CSV)</b><span>Owners and admins can download orders, because the file contains customers&apos; contact details.</span></div>}
      </div>
    </div>
  );
}
