import type { Metadata } from "next";
import { DemoSample } from "@/components/demo/DemoSample";

export const metadata: Metadata = {
  title: "Demo: Style and Sip order form",
  description: "Try a real QueuedToGo order form from a live event. Nothing you type is saved.",
  robots: { index: false, follow: true },
};

export default async function DemoOrderPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DemoSample which="style-and-sip" framed={(await searchParams).frame === "1"} />;
}
