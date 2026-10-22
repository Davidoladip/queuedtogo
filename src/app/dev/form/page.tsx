import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/form/FormRenderer";
import { harnessEnabled, sampleForm } from "../sample";

/** Development harness: the public renderer with the sample form. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevFormPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const form = sampleForm();
  if (sp.gate === "1") form.design.adv.disableUntilValid = true;
  return (
    <div className="pf-page">
      <FormRenderer form={form} assetBase="https://example.invalid/storage" mode="live" businessName="Demo Business" />
    </div>
  );
}
