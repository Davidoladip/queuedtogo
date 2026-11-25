import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoBar } from "@/components/demo/DemoBar";
import { DemoForm } from "@/components/demo/DemoForm";
import { templateByKey } from "@/lib/templates";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = templateByKey((await params).key);
  return {
    title: t ? `Sample form: ${t.name}` : "Sample form",
    description: "Try a QueuedToGo sample form the way your guests would. Nothing you type is saved.",
    robots: { index: false, follow: true },
  };
}

/** A template's sample form as a working demo. ?frame=1: shown inside the homepage's phone frame (no demo strip). */
export default async function DemoTemplatePage({ params, searchParams }: Props) {
  const t = templateByKey((await params).key);
  if (!t) notFound();
  const framed = (await searchParams).frame === "1";
  return (
    <div className="pf-page">
      {!framed && <DemoBar current="template" note={`A sample form from the ${t.name} template. Fill it in as a guest would; nothing you type is saved or sent.`} />}
      <DemoForm form={t.build()} assetBase="" />
    </div>
  );
}
