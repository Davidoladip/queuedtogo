import type { Metadata } from "next";
import { DemoBar } from "@/components/demo/DemoBar";
import { DEMO_BUSINESS } from "@/lib/demo";

export const metadata: Metadata = { title: "Demo order tracking", robots: { index: false, follow: true } };

const STAGES = [
  { name: "New order", at: "7:12 PM", state: "past" },
  { name: "In production", at: "7:20 PM", state: "now" },
  { name: "Quality check", at: null, state: "next" },
  { name: "Ready for collection", at: null, state: "next" },
] as const;

/** What a customer sees from the link in their texts (sample data, mirrors the real tracking page). */
export default function DemoTrackPage() {
  return (
    <>
      <DemoBar current="track" />
      <div className="auth-shell wrap">
        <main className="auth-card" style={{ maxWidth: 520 }}>
          <span className="section-label">{DEMO_BUSINESS}</span>
          <div>
            <h1>Order <span className="mono" style={{ fontWeight: 500 }}>QTG-1042</span></h1>
            <p className="muted">Custom tee</p>
          </div>
          <div className="notice info">
            <div className="section-label">Current status</div>
            <b style={{ fontFamily: "var(--f-display)", fontSize: 22 }}>In production</b>
          </div>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {STAGES.map((s) => (
              <li key={s.name} style={{ display: "flex", gap: 10, alignItems: "center", opacity: s.state === "next" ? 0.55 : 1 }}>
                <span aria-hidden="true" className="dot" style={{ "--c": s.state === "past" ? "var(--good)" : s.state === "now" ? "var(--accent)" : "var(--line)", width: 14, height: 14 } as React.CSSProperties} />
                <span style={{ flex: 1, fontWeight: s.state === "now" ? 600 : 400 }}>{s.name}{s.state === "now" && <span className="sr-only"> (current)</span>}</span>
                {s.at && <small className="muted">{s.at}</small>}
              </li>
            ))}
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>
            This page updates by itself as the order moves along, and the customer gets a text at the stages you choose
            (for example &ldquo;Your order QTG-1042 is ready to pick up&rdquo;).
          </p>
        </main>
      </div>
    </>
  );
}
