import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ENVELOPE_STYLES, assetBaseFor } from "@/lib/design/engine";
import { templateByKey } from "@/lib/templates";
import { DemoForm } from "@/components/demo/DemoForm";
import { harnessEnabled } from "../sample";

/** Development harness: the RSVP envelope in each ready-made style. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevEnvelopes({ searchParams }: { searchParams: Promise<{ glow?: string; size?: string }> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const assetBase = assetBaseFor(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co");
  return (
    <main className="page wrap">
      <h1>Envelope styles</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
        {ENVELOPE_STYLES.map((st) => {
          const f = templateByKey("wedding")!.build();
          f.design.theme.page = st.set.color && st.key !== "midnight" ? "#2A2622" : "#0E1020";
          Object.assign(f.settings.cover.envelope, st.set, { front: "For our honoured guest", glow: !!sp.glow, size: sp.size ?? "medium" });
          return (
            <section key={st.key} data-style={st.key} style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "6px 10px", fontWeight: 600 }}>{st.name}</div>
              <div style={{ height: 380, overflow: "hidden" }}><DemoForm form={f} assetBase={assetBase} /></div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
