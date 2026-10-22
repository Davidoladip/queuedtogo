import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submissions" };

export default async function SubmissionsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  let q = supabase
    .from("form_submissions")
    .select("id, created_at, consent, form_id, forms(title), customers(name, email, phone), jobs(number, summary)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sp.form && /^[0-9a-f-]{36}$/.test(sp.form)) q = q.eq("form_id", sp.form);
  const [{ data: subs, error }, { data: forms }] = await Promise.all([
    q,
    supabase.from("forms").select("id, title").eq("org_id", org.id).order("title"),
  ]);
  if (error) throw new Error(error.message);
  const when = (d: string) => new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Submissions</h1>
          <p>Every order from your event forms, newest first. Each one is also a job on the production board.</p>
        </div>
        {forms && forms.length > 1 && (
          <form className="sub-filter">
            <label htmlFor="sub-form" className="sr-only">Form</label>
            <select id="sub-form" name="form" defaultValue={sp.form ?? ""}>
              <option value="">All forms</option>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
            <button className="btn small" type="submit">Show</button>
          </form>
        )}
      </div>
      {subs.length ? (
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Order</th><th>Submitted</th><th>Customer</th><th>Form</th><th>Summary</th></tr></thead>
            <tbody>
              {subs.map((s) => {
                const job = Array.isArray(s.jobs) ? s.jobs[0] : s.jobs;
                const c = s.customers;
                return (
                  <tr key={s.id}>
                    <td><Link href={`/w/${org.slug}/submissions/${s.id}`} className="mono"><b>{job ? `QTG-${job.number}` : "View"}</b></Link></td>
                    <td className="muted">{when(s.created_at)}</td>
                    <td>{c?.name ?? c?.email ?? c?.phone ?? "—"}{c?.phone && c?.name ? <div className="muted mono" style={{ fontSize: 12 }}>{c.phone}</div> : null}</td>
                    <td>{s.forms?.title}</td>
                    <td className="muted" style={{ maxWidth: 360 }}>{job?.summary ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <b>No submissions yet</b>
          <span>Orders appear here as soon as customers send a published, live form.</span>
        </div>
      )}
    </>
  );
}
