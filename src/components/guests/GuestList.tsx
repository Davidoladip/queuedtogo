"use client";

import "./guests.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { prettyPhone } from "@/lib/eventday";
import { filterGuests, guestTotals, replyLabel, searchGuests, sortGuests, type Guest, type GuestFilter } from "@/lib/guests";

export type GuestRow = Omit<Guest, "answers"> & { notes: string };
type Result = { ok: true } | { ok: false; error: string };

type Props = {
  guests: GuestRow[];
  capacity: number | null;
  canManage: boolean;
  timeZone: string;
  checkIn: (id: string, on: boolean) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
  exportHref: string | null;
  printHref: string;
  /** Start in door check-in mode (?door=1). */
  door?: boolean;
};

const FILTERS: [GuestFilter, string][] = [["all", "Everyone"], ["coming", "Coming (yes + maybe)"], ["yes", "Yes"], ["maybe", "Maybe"], ["no", "Can't come"], ["waitlist", "Waitlist"], ["expected", "Not here yet"], ["arrived", "Checked in"]];

export function GuestList(p: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<GuestFilter>(p.door ? "coming" : "all");
  const [door, setDoor] = useState(!!p.door);
  const [over, setOver] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const search = useRef<HTMLInputElement>(null);

  // Keep the list fresh while the door screen is open (other phones may be checking guests in too).
  useEffect(() => {
    if (!door) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 20_000);
    return () => window.clearInterval(id);
  }, [door, router]);

  const guests = useMemo(() => p.guests.map((g) => (g.id in over ? { ...g, checkedInAt: over[g.id] } : g)), [p.guests, over]);
  const t = guestTotals(guests.map((g) => ({ ...g, answers: {} })));
  const shown = sortGuests(searchGuests(filterGuests(guests.map((g) => ({ ...g, answers: {} })), filter), q)).map((g) => guests.find((x) => x.id === g.id)!);
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: p.timeZone, hour: "numeric", minute: "2-digit" });
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: p.timeZone, month: "short", day: "numeric" });

  async function toggle(g: GuestRow) {
    const on = !g.checkedInAt;
    setBusy(g.id);
    setOver((o) => ({ ...o, [g.id]: on ? new Date().toISOString() : null }));
    let r: Result;
    try { r = await p.checkIn(g.id, on); } catch { r = { ok: false, error: "We couldn't reach the server. Try again." }; }
    setBusy(null);
    if (!r.ok) setOver((o) => { const n = { ...o }; delete n[g.id]; return n; });
    setNote(r.ok ? { ok: true, text: on ? `${g.name ?? "Guest"} checked in${g.party > 1 ? ` (party of ${g.party})` : ""}.` : `${g.name ?? "Guest"} is no longer checked in.` } : { ok: false, text: r.error });
    if (r.ok && door && on) { setQ(""); search.current?.focus(); }
    startTransition(() => router.refresh());
  }
  async function drop(g: GuestRow) {
    if (!window.confirm(`Remove ${g.name ?? "this guest"} from the list? ${g.status === "yes" && !g.waitlisted ? "Their place goes to the next guest on the waitlist, if there is one. " : ""}This can't be undone.`)) return;
    setBusy(g.id);
    let r: Result;
    try { r = await p.remove(g.id); } catch { r = { ok: false, error: "We couldn't reach the server. Try again." }; }
    setBusy(null);
    setNote(r.ok ? { ok: true, text: `${g.name ?? "Guest"} was removed.` } : { ok: false, text: r.error });
    startTransition(() => router.refresh());
  }

  const coming = t.headcount;
  return (
    <div className={`qg${door ? " door" : ""}`}>
      <div className="qg-stats" role="list" aria-label="Totals">
        <div className="qg-stat" role="listitem"><b>{coming}{p.capacity ? <small> / {p.capacity}</small> : null}</b><span>coming ({t.yes} {t.yes === 1 ? "reply" : "replies"})</span></div>
        <div className="qg-stat" role="listitem"><b>{t.maybePeople}</b><span>maybe ({t.maybe})</span></div>
        <div className="qg-stat" role="listitem"><b>{t.no}</b><span>can&apos;t come</span></div>
        {(t.waitlist > 0 || p.capacity) && <div className="qg-stat" role="listitem"><b>{t.waitlistPeople}</b><span>on the waitlist ({t.waitlist})</span></div>}
        <div className="qg-stat arrived" role="listitem"><b>{t.arrived}<small> / {coming}</small></b><span>checked in</span></div>
      </div>
      {p.capacity != null && (
        <div className="qg-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (coming / p.capacity) * 100).toFixed(1)}%` }} /></div>
      )}

      <div className="qg-tools">
        <input ref={search} className="qg-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={door}
          placeholder={door ? "Find a guest: name, email or last 4 digits of phone" : "Search guests"} aria-label="Search guests" />
        <label className="qg-filter"><span className="sr-only">Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as GuestFilter)} aria-label="Show">
            {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <button type="button" className={`btn${door ? " primary" : ""}`} aria-pressed={door} onClick={() => { setDoor(!door); if (!door) setFilter("coming"); }}>
          {door ? "Exit door mode" : "Door check-in"}
        </button>
        {!door && <a className="btn ghost" href={p.printHref} target="_blank" rel="noopener">Print list</a>}
        {!door && p.exportHref && <a className="btn ghost" href={p.exportHref}>Download CSV</a>}
      </div>

      <div aria-live="polite" className="qg-note">
        {note && <p role={note.ok ? undefined : "alert"} className={note.ok ? "ok" : "err"}>{note.ok ? "✓ " : ""}{note.text}</p>}
      </div>

      {shown.length === 0 ? (
        <p className="muted">{p.guests.length === 0 ? "No replies yet. Share the form link (Forms → open the form → Settings) to start collecting RSVPs." : `No guests match${q.trim() ? ` “${q.trim()}”` : " this filter"}.`}</p>
      ) : (
        <ul className="qg-list">
          {shown.map((g) => {
            const can = g.status !== "no" && !g.waitlisted;
            return (
              <li key={g.id} className={`qg-row${g.checkedInAt ? " in" : ""}`} data-guest={g.name ?? ""}>
                <div className="qg-who">
                  <b>{g.name ?? "Guest"}</b>
                  {g.party > 1 && <span className="qg-party">+{g.party - 1}</span>}
                  <span className={`pill ${g.waitlisted ? "warn" : g.status === "yes" ? "good" : g.status === "maybe" ? "accent" : ""}`}>{replyLabel(g)}</span>
                </div>
                <div className="qg-meta">
                  {[g.email, prettyPhone(g.phone)].filter(Boolean).join(" · ")}
                  {!door && <> · replied {day(g.respondedAt)}</>}
                  {g.notes && <div className="qg-notes">{g.notes}</div>}
                </div>
                <div className="qg-act">
                  {g.checkedInAt && <span className="qg-in">✓ Arrived {time(g.checkedInAt)}</span>}
                  {(can || g.checkedInAt) && (
                    <button type="button" className={`btn${g.checkedInAt ? " ghost small" : " primary"}`} disabled={busy === g.id} onClick={() => void toggle(g)}
                      aria-label={g.checkedInAt ? `Undo check-in for ${g.name ?? "guest"}` : `Check in ${g.name ?? "guest"}`}>
                      {g.checkedInAt ? "Undo" : g.party > 1 ? `Check in (${g.party})` : "Check in"}
                    </button>
                  )}
                  {!door && p.canManage && <button type="button" className="btn ghost small" disabled={busy === g.id} onClick={() => void drop(g)} aria-label={`Remove ${g.name ?? "guest"}`}>Remove</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
