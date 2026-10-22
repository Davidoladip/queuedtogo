import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/urls";
import { formatAnswer, type Answer } from "@/lib/submission";
import { CopyField } from "@/components/ui/CopyField";

export const metadata: Metadata = { title: "Order details" };

export default async function SubmissionPage({ params }: { params: Promise<{ orgSlug: string; id: string }> }) {
  const { orgSlug, id } = await params;
  const { org } = await requireWorkspace(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("form_submissions")
    .select("id, created_at, consent, answers, form_version, forms(title, slug), customers(name, email, phone, preferred_channel, consent_updates), jobs(number, title, tracking_token, workflow_stages(name))")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (!s) notFound();
  const { data: files } = await supabase.from("files").select("id, path, original_name, mime_type, size_bytes").eq("submission_id", id);
  // Customer files are private: members get short-lived links (10 minutes).
  const links = new Map<string, string>();
  for (const f of files ?? []) {
    const { data } = await supabase.storage.from("submission-uploads").createSignedUrl(f.path, 600);
    if (data?.signedUrl) links.set(f.path, data.signedUrl);
  }
  const job = Array.isArray(s.jobs) ? s.jobs[0] : s.jobs;
  const c = s.customers;
  const answers = Object.entries((s.answers ?? {}) as Record<string, Answer>);
  const site = await siteUrl();

  return (
    <>
      <div className="view-head">
        <div>
          <Link href={`/w/${org.slug}/submissions`} className="btn ghost small">← All submissions</Link>
          <h1 style={{ marginTop: 8 }}>{job ? <>Order <span className="mono">QTG-{job.number}</span></> : "Submission"}</h1>
          <p>{s.forms?.title} · {new Date(s.created_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: org.timezone })}</p>
        </div>
        {job && <span className="pill accent">{job.workflow_stages?.name ?? "On the board"}</span>}
      </div>
      <div className="grid2">
        <section className="panel">
          <h2>Answers</h2>
          <dl className="answers">
            {answers.length ? answers.map(([k, a]) => {
              const path = a.value && typeof a.value === "object" && !Array.isArray(a.value) && "path" in a.value ? String(a.value.path) : null;
              return (
                <div key={k}>
                  <dt>{a.label}</dt>
                  <dd>{path && links.get(path) ? <a href={links.get(path)} target="_blank" rel="noopener noreferrer">{formatAnswer(a).replace(/^File: /, "")} ↗</a> : formatAnswer(a)}</dd>
                </div>
              );
            }) : <p className="muted">No answers were recorded.</p>}
          </dl>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Answered on version {s.form_version} of the form. Labels are shown as they were when the customer answered.</p>
        </section>
        <div className="stack">
          <section className="panel">
            <h2>Customer</h2>
            {c ? (
              <dl className="answers">
                {c.name && <div><dt>Name</dt><dd>{c.name}</dd></div>}
                {c.email && <div><dt>Email</dt><dd><a href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
                {c.phone && <div><dt>Mobile</dt><dd><a href={`tel:${c.phone}`}>{c.phone}</a></dd></div>}
                <div><dt>Order updates</dt><dd>{s.consent ? `Agreed to ${c.preferred_channel === "email" ? "email" : c.preferred_channel === "whatsapp" ? "WhatsApp" : "SMS"} updates` : "Did not agree to updates"}</dd></div>
              </dl>
            ) : <p className="muted">No contact details were given.</p>}
          </section>
          {job && (
            <section className="panel">
              <h2>Tracking link</h2>
              <p className="muted" style={{ marginBottom: 8 }}>The customer saw this after ordering. It shows the order&apos;s stage only.</p>
              <CopyField value={`${site}/t/${job.tracking_token}`} label="Copy link" />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
