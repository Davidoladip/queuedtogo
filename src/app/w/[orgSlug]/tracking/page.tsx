import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Tracking" };

export default async function TrackingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, number, title, tracking_token, workflow_stages(name)")
    .eq("org_id", org.id)
    .order("number", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Tracking</h1>
          <p>Each job has a private tracking link for its customer. It shows the order&apos;s stage, never internal notes or staff names.</p>
        </div>
      </div>
      {jobs.length ? (
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Order</th><th>Job</th><th>Stage</th><th>Customer link</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="mono">QTG-{j.number}</td>
                  <td>{j.title}</td>
                  <td>{j.workflow_stages?.name}</td>
                  <td><Link href={`/t/${j.tracking_token}`}>Open tracking page</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel empty">
          <b>No jobs yet</b>
          <span>Tracking links are created with each job.</span>
        </div>
      )}
    </>
  );
}
