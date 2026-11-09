import type { Metadata } from "next";
import { DemoBar } from "@/components/demo/DemoBar";
import { DemoForm } from "@/components/demo/DemoForm";
import { demoOrderForm } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Demo order form",
  description: "Try a QueuedToGo order form the way your customers would. Nothing you type is saved.",
  robots: { index: false, follow: true },
};

export default function DemoOrderPage() {
  return (
    <div className="pf-page">
      <DemoBar current="order" />
      <DemoForm form={demoOrderForm()} />
    </div>
  );
}
