import type { Metadata } from "next";
import { DemoSample } from "@/components/demo/DemoSample";

export const metadata: Metadata = {
  title: "Demo: live embroidery order form",
  description: "Try a real QueuedToGo live-embroidery order form. Nothing you type is saved.",
  robots: { index: false, follow: true },
};

export default async function DemoEmbroideryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <DemoSample which="embroidery" framed={(await searchParams).frame === "1"} />;
}
