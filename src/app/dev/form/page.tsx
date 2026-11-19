import { notFound } from "next/navigation";
import { FormRenderer } from "@/components/form/FormRenderer";
import { DemoOrderForm } from "./DemoOrderForm";
import { harnessEnabled, samplePaidForm, sampleForm } from "../sample";

/** Development harness: the public renderer with the sample form. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevFormPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const form = sp.sample === "paid" ? samplePaidForm() : sampleForm();
  if (sp.fee === "business") form.settings.pay.feePayer = "business";
  const feeRate = sp.sample === "paid" ? 0.02 : 0;
  // ?left=low: 3 General left and VIP sold out, as the public form would report.
  const ticketsLeft = sp.left === "low" ? { tt_general01: 3, tt_vip000001: 0 } : null;
  if (sp.gate === "1") form.design.adv.disableUntilValid = true;
  return (
    <div className="pf-page">
      {sp.ordering === "off" ? <FormRenderer form={form} assetBase="/dev/assets" mode="live" businessName="Demo Business" feeRate={feeRate} ticketsLeft={ticketsLeft} /> : <DemoOrderForm form={form} feeRate={feeRate} ticketsLeft={ticketsLeft} />}
    </div>
  );
}
