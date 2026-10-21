import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submissions" };

export default async function SubmissionsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { data: subs, error } = await supabase
    .from("form_submissions")
    .select("id, created_at, forms(title), customers(name, email, phone)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Submissions</h1>
          <p>Every answer from your event forms, newest first.</p>
        </div>
      </div>
      {subs.length ? (
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Submitted</th><th>Form</th><th>Customer</th></tr></thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{new Date(s.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone })}</td>
                  <td>{s.forms?.title}</td>
                  <td>{s.customers?.name ?? s.customers?.email ?? s.customers?.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <b>No submissions yet</b>
          <span>Submissions appear here once a published form starts taking orders. Public forms go live in a later stage.</span>
        </div>
      )}
    </>
  );
}
