import { env } from "@/lib/env";
import { assetBaseFor } from "@/lib/design/engine";
import { sampleForm, type SampleKey } from "@/lib/demo";
import { DemoBar } from "./DemoBar";
import { DemoForm } from "./DemoForm";

/** One of the real sample forms as a demo. framed: shown inside the homepage's phone frame (no demo strip). */
export function DemoSample({ which, framed }: { which: SampleKey; framed: boolean }) {
  return (
    <div className="pf-page">
      {!framed && <DemoBar current={which} />}
      <DemoForm form={sampleForm(which)} assetBase={assetBaseFor(env.supabaseUrl)} />
    </div>
  );
}
