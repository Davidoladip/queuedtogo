import type { Metadata } from "next";
import { DemoBar } from "@/components/demo/DemoBar";
import { DemoForm } from "@/components/demo/DemoForm";
import { demoInvitationForm } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Demo invitation",
  description: "Open a QueuedToGo RSVP invitation the way your guests would. Nothing you type is saved.",
  robots: { index: false, follow: true },
};

export default function DemoInvitationPage() {
  return (
    <div className="pf-page">
      <DemoBar current="invitation" />
      <DemoForm form={demoInvitationForm()} assetBase="" />
    </div>
  );
}
