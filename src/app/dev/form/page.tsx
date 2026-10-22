import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/form/FormRenderer";
import { DemoOrderForm } from "./DemoOrderForm";
import { harnessEnabled, sampleForm } from "../sample";

/** Development harness: the public renderer with the sample form. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevFormPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const form = sampleForm();
  if (sp.gate === "1") form.design.adv.disableUntilValid = true;
  return (
    <div className="pf-page">
      {sp.ordering === "off" ? <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" /> : <DemoOrderForm form={form} />}
    </div>
  );
}
