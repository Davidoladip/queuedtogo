import "./event.css";
import { Fragment } from "react";
import { formatDay } from "@/lib/board";
import { itemsLine, prettyPhone, type DayJob } from "@/lib/eventday";
import { formatAnswer } from "@/lib/submission";

/**
 * Printable order tickets (one per 4×6 in page) or address-label sheets (Avery 5160 / 8160: 30 per US Letter page).
 * qr: job id → SVG markup of a QR code that opens the job (made on the server by the qrcode library from our own URL).
 */
export function PrintSheet({ kind, jobs, stageName, business, qr }: { kind: "tickets" | "labels"; jobs: DayJob[]; stageName: (id: string) => string; business: string; qr: Map<string, string> }) {
  const page = kind === "tickets" ? "@page { size: 4in 6in; margin: 0.25in; }" : "@page { size: letter; margin: 0.5in 0.1875in; }";
  return (
    <div className="qe qe-sheet">
      <style>{page}</style>
      {kind === "tickets" ? jobs.map((j) => (
        <article key={j.id} className="qe-ticket" data-job={j.number}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div>
              <div className="num">QTG-{j.number}</div>
              <div className="who">{j.customerName ?? "Customer"}</div>
              <div style={{ fontSize: 12, color: "#555" }}>{business}{j.formTitle ? ` · ${j.formTitle}` : ""}</div>
            </div>
            {/* The SVG is generated on the server by the qrcode library from a URL we build; it never contains user input as markup. */}
            {qr.get(j.id) && <div className="qr" aria-label="QR code: open this job" dangerouslySetInnerHTML={{ __html: qr.get(j.id)! }} />}
          </div>
          <dl>
            {Object.values(j.answers ?? {}).filter((a) => a.type !== "upload").map((a, i) => (<Fragment key={i}><dt>{a.label}</dt><dd>{formatAnswer(a)}</dd></Fragment>))}
            {j.phone && <><dt>Mobile</dt><dd>{prettyPhone(j.phone)}</dd></>}
            <dt>Stage</dt><dd>{stageName(j.stageId)}</dd>
            {j.dueDate && <><dt>Due</dt><dd>{formatDay(j.dueDate)}</dd></>}
            {j.assignee && <><dt>Assigned</dt><dd>{j.assignee}</dd></>}
          </dl>
        </article>
      )) : (
        <div className="qe-labels">
          {jobs.map((j) => (
            <div key={j.id} className="qe-label" data-job={j.number}>
              <span className="num">QTG-{j.number}</span>
              <span className="who">{j.customerName ?? "Customer"}</span>
              <span className="what">{itemsLine(j, 70)}</span>
            </div>
          ))}
        </div>
      )}
      {!jobs.length && <p className="muted">No orders match these filters.</p>}
    </div>
  );
}
