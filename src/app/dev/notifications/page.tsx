import { connection } from "next/server";
import { notFound } from "next/navigation";
import { NotificationsPanel } from "@/components/notify/NotificationsPanel";
import { twilioSetupStatus } from "@/lib/sms";
import { maskPhone } from "@/lib/notify";
import { harnessEnabled } from "../sample";
import { notifyStore } from "./store";
import { devSaveStage, devSendTest, devSetTexting } from "./actions";

/** Development harness: the Notifications page. ?role=member shows the read-only view. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const s = notifyStore();
  return (
    <main className="page wrap">
      <div className="view-head"><div><h1>Notifications</h1><p>Development harness.</p></div></div>
      <NotificationsPanel business="Demo Business" textingOn={s.textingOn} canEdit={sp.role !== "member"} twilio={twilioSetupStatus()}
        stages={structuredClone(s.stages)} log={s.log.map((m) => ({ ...m, to: m.to ? maskPhone(m.to) : null }))} siteUrl="http://localhost:3000" jobHref="/dev/board/" timeZone="America/New_York"
        setTexting={devSetTexting} saveStage={devSaveStage} sendTest={devSendTest} />
    </main>
  );
}
