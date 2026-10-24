"use client";

import { useState } from "react";

/** Lets a customer stop order updates from their tracking page (the link in emails and texts leads here). */
export function StopUpdates({ business, prompt, stop }: { business: string; prompt: boolean; stop: () => Promise<{ ok: boolean }> }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <div className="notice success" role="status">Done. You won&apos;t get any more order updates from {business}. Your tracking page still works.</div>;
  return (
    <div className={prompt ? "notice info" : undefined} style={prompt ? undefined : { fontSize: 13 }}>
      {prompt && <p style={{ marginBottom: 8 }}><b>Stop order updates?</b> You&apos;ll stop getting texts and emails about your orders from {business}.</p>}
      <button type="button" className={`btn ${prompt ? "primary" : "ghost small"}`} disabled={state === "busy"}
        onClick={async () => { setState("busy"); try { setState((await stop()).ok ? "done" : "error"); } catch { setState("error"); } }}>
        {state === "busy" ? "Stopping…" : "Stop order updates"}
      </button>
      {state === "error" && <p className="muted" role="alert" style={{ marginTop: 6 }}>That didn&apos;t work. Try again, or reply STOP to any text.</p>}
    </div>
  );
}
