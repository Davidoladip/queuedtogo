import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/form/FormRenderer";
import { harnessEnabled, sampleForm } from "../sample";

/** Development harness: the public renderer with the sample form. 404 unless QTG_DEV_HARNESS=1. */
export default function DevFormPage() {
  if (!harnessEnabled()) notFound();
  return (
    <div className="pf-page">
      <FormRenderer form={sampleForm()} assetBase="https://example.invalid/storage" mode="live" businessName="Demo Business" />
    </div>
  );
}
