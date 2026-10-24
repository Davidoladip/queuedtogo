import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { StopUpdates } from "@/components/ui/StopUpdates";
import { stopUpdates } from "@/server/actions/tracking";

export const metadata: Metadata = { title: "Order tracking", robots: { index: false, follow: false } };

type Tracking = {
  number: number;
  title: string;
  summary: string | null;
  due_date: string | null;
  org_name: string;
  current_stage_id: string;
  stages: { id: string; name: string; position: number; is_final: boolean }[];
  history: { stage_id: string; at: string }[];
  updates_on?: boolean;
};

/** Customer tracking page. Shows status only: no customer details, notes or staff names. */
export default async function TrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f]{32,}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_job_tracking", { p_token: token });
  if (error) throw new Error(error.message);
  const t = data as Tracking | null;
  if (!t) notFound();

  const current = t.stages.find((s) => s.id === t.current_stage_id);
  const reached = new Map(t.history.map((h) => [h.stage_id, h.at]));
  const done = current?.is_final;

  return (
    <div className="auth-shell wrap">
      <main className="auth-card" style={{ maxWidth: 520 }}>
        <span className="section-label">{t.org_name}</span>
        <div>
          <h1>Order <span className="mono" style={{ fontWeight: 500 }}>QTG-{t.number}</span></h1>
          <p className="muted">{t.summary ?? t.title}</p>
        </div>
        <div className="notice info">
          <div className="section-label">Current status</div>
          <b style={{ fontFamily: "var(--f-display)", fontSize: 22 }}>{current?.name}</b>
          {done && <div>Your order is complete. Thank you!</div>}
          {!done && t.due_date && <div>Expected by {new Date(t.due_date + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>}
        </div>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {t.stages.map((s) => {
            const isPast = current ? s.position < current.position || (done && s.id === current.id) : false;
            const isNow = s.id === current?.id && !done;
            const at = reached.get(s.id);
            return (
              <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", opacity: isPast || isNow ? 1 : 0.55 }}>
                <span aria-hidden="true" className="dot" style={{ "--c": isPast ? "var(--good)" : isNow ? "var(--accent)" : "var(--line)", width: 14, height: 14 } as React.CSSProperties} />
                <span style={{ flex: 1, fontWeight: isNow ? 600 : 400 }}>{s.name}{isNow && <span className="sr-only"> (current)</span>}</span>
                {at && (isPast || isNow) && <small className="muted">{new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small>}
              </li>
            );
          })}
        </ol>
        {t.updates_on && <StopUpdates business={t.org_name} prompt={sp.stop === "1"} stop={stopUpdates.bind(null, token)} />}
        {!t.updates_on && sp.stop === "1" && <p className="muted" style={{ fontSize: 13 }}>Order updates are already off for this order.</p>}
        <AutoRefresh seconds={60} />
        <p className="muted" style={{ fontSize: 13 }}>This page updates by itself as your order moves along. Questions? Contact {t.org_name} and quote QTG-{t.number}.</p>
      </main>
    </div>
  );
}
