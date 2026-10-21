import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Event forms" };

export default async function FormsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { data: forms, error } = await supabase
    .from("forms")
    .select("id, title, slug, status, event_date, updated_at")
    .eq("org_id", org.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Event forms</h1>
          <p>Each live event gets its own order form. Every submission becomes a job on the production board.</p>
        </div>
      </div>
      {forms.length ? (
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Form</th><th>Event date</th><th>Status</th><th>Last edited</th></tr></thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.title}</b><div className="muted mono" style={{ fontSize: 12 }}>/f/{org.slug}/{f.slug}</div></td>
                  <td>{f.event_date ? new Date(f.event_date + "T12:00").toLocaleDateString("en-US", { dateStyle: "medium" }) : "—"}</td>
                  <td><span className={`pill ${f.status === "live" ? "good" : f.status === "closed" ? "bad" : "plain"}`}>{f.status}</span></td>
                  <td className="muted">{new Date(f.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <b>No event forms yet</b>
          <span>The form builder from the prototype moves here in the next stage. Forms you create will be saved to your business.</span>
        </div>
      )}
    </>
  );
}
