import type { Metadata } from "next";
import { after } from "next/server";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/urls";
import { twilioSetupStatus } from "@/lib/sms";
import { emailSetupStatus } from "@/lib/email";
import { loadMessageLog } from "@/lib/notify-data";
import { dispatchQueued } from "@/server/messaging";
import { saveReplyTo, saveStageMessage, sendTestEmail, sendTestText, setEmailOn, setMyAlerts, setTexting } from "@/server/actions/notifications";
import { NotificationsPanel } from "@/components/notify/NotificationsPanel";
import { EmailSettings } from "@/components/notify/EmailSettings";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [{ data: stages, error }, { data: o }, log, site, { data: mine }] = await Promise.all([
    supabase.from("workflow_stages").select("id, name, color, notify_customer, message_template").eq("org_id", org.id).order("position"),
    supabase.from("organizations").select("texting_enabled, email_enabled, reply_to_email").eq("id", org.id).single(),
    loadMessageLog(supabase, org.id),
    siteUrl(),
    supabase.from("member_alerts").select("new_order_email").eq("org_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  // Send anything still waiting (for example after a brief Twilio outage).
  if (log.some((m) => m.status === "queued")) after(() => dispatchQueued({ orgId: org.id }));

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Notifications</h1>
          <p>Keep customers updated by text or email as their order moves through your stages, and get alerts for new orders.</p>
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
        emailSlot={
          <EmailSettings
            status={emailSetupStatus()}
            emailOn={Boolean(o?.email_enabled)}
            replyTo={o?.reply_to_email ?? ""}
            myAlerts={mine?.new_order_email ?? true}
            myEmail={user.email}
            canEdit={canManage(org.role)}
            setEmailOn={setEmailOn.bind(null, org.slug)}
            saveReplyTo={saveReplyTo.bind(null, org.slug)}
            setMyAlerts={setMyAlerts.bind(null, org.slug)}
            sendTest={sendTestEmail.bind(null, org.slug)}
          />
        }
      />
    </>
  );
}
