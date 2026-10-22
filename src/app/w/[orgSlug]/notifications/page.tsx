import type { Metadata } from "next";
import { after } from "next/server";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/urls";
import { twilioSetupStatus } from "@/lib/sms";
import { loadMessageLog } from "@/lib/notify-data";
import { dispatchQueued } from "@/server/messaging";
import { saveStageMessage, sendTestText, setTexting } from "@/server/actions/notifications";
import { NotificationsPanel } from "@/components/notify/NotificationsPanel";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [{ data: stages, error }, { data: o }, log, site] = await Promise.all([
    supabase.from("workflow_stages").select("id, name, color, notify_customer, message_template").eq("org_id", org.id).order("position"),
    supabase.from("organizations").select("texting_enabled").eq("id", org.id).single(),
    loadMessageLog(supabase, org.id),
    siteUrl(),
  ]);
  if (error) throw new Error(error.message);
  // Send anything still waiting (for example after a brief Twilio outage).
  if (log.some((m) => m.status === "queued")) after(() => dispatchQueued({ orgId: org.id }));

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Notifications</h1>
          <p>Text customers as their order moves through your stages. Each stage can send its own message.</p>
        </div>
      </div>
      <NotificationsPanel
        business={org.name}
        textingOn={Boolean(o?.texting_enabled)}
        canEdit={canManage(org.role)}
        twilio={twilioSetupStatus()}
        stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color, notify: s.notify_customer, template: s.message_template ?? "" }))}
        log={log}
        siteUrl={site}
        jobHref={`/w/${org.slug}/board/`}
        timeZone={org.timezone}
        setTexting={setTexting.bind(null, org.slug)}
        saveStage={saveStageMessage.bind(null, org.slug)}
        sendTest={sendTestText.bind(null, org.slug)}
      />
    </>
  );
}
