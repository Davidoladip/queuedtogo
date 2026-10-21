import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/Notice";
import { NewFormForm } from "./NewFormForm";

export const metadata: Metadata = { title: "Event forms" };

export default async function FormsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { data: forms, error } = await supabase
    .from("forms")
    .select("id, title, slug, status, event_date, updated_at, published_version")
    .eq("org_id", org.id)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Event forms</h1>
          <p>Each live event gets its own themed order form. Every submission becomes a job on the production board.</p>
        </div>
      </div>
      <div className="stack">
        {sp.deleted && <Notice tone="success">Form deleted.</Notice>}
        {sp.notdeleted && <Notice tone="error">That form wasn&apos;t deleted. Only owners and admins can delete forms.</Notice>}
        <div className="panel"><NewFormForm orgId={org.id} /></div>
        {forms.length ? (
          <div className="tablewrap">
            <table className="list">
              <thead><tr><th>Form</th><th>Event date</th><th>Status</th><th>Last edited</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {forms.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/w/${org.slug}/forms/${f.id}`}><b>{f.title}</b></Link>
                      <div className="muted mono" style={{ fontSize: 12 }}>/f/{org.slug}/{f.slug}</div>
                    </td>
                    <td>{f.event_date ? new Date(f.event_date + "T12:00").toLocaleDateString("en-US", { dateStyle: "medium" }) : "—"}</td>
                    <td><span className={`pill ${f.status === "live" ? "good" : f.status === "closed" ? "bad" : "plain"}`}>{f.status === "live" ? "Live" : f.status === "closed" ? "Closed" : "Draft"}</span></td>
                    <td className="muted">{new Date(f.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone })}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {f.status === "live" && <a className="btn small ghost" href={`/f/${org.slug}/${f.slug}`} target="_blank" rel="noopener noreferrer">Open ↗</a>}
                      <Link className="btn small" href={`/w/${org.slug}/forms/${f.id}`}>Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel empty">
            <b>No event forms yet</b>
            <span>Create your first form above. It starts with a few common questions you can change.</span>
          </div>
        )}
      </div>
    </>
  );
}
