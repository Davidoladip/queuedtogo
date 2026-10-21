import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/Notice";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const { data: stages, error } = await supabase
    .from("workflow_stages")
    .select("id, name, color, notify_customer, message_template")
    .eq("org_id", org.id)
    .order("position");
  if (error) throw new Error(error.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Notifications</h1>
          <p>The customer update each stage will send, saved with your business.</p>
        </div>
      </div>
      <div className="stack">
        <Notice tone="info">
          Sending is not connected yet. SMS and WhatsApp (through Twilio) and email are a later stage. Until then, no messages are sent.
        </Notice>
        {stages.map((s) => (
          <div key={s.id} className="panel" style={{ padding: 14 }}>
            <div className="panel-head" style={{ marginBottom: 6 }}>
              <b style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="dot" style={{ "--c": s.color } as React.CSSProperties} />{s.name}</b>
              <span className={`pill ${s.notify_customer ? "good" : "plain"}`}>{s.notify_customer ? "On" : "Off"}</span>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>{s.message_template}</p>
          </div>
        ))}
      </div>
    </>
  );
}
