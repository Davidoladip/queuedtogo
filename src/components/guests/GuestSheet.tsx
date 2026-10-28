import "./guests.css";
import { guestTotals, replyLabel, type Guest } from "@/lib/guests";

/** The printed door list. Shared by the real page and the development harness. */
export function GuestSheet({ title, eventDate, business, guests }: { title: string; eventDate: string | null; business: string; guests: Guest[] }) {
  const list = guests.filter((g) => g.status !== "no" && !g.waitlisted).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }));
  const t = guestTotals(guests);
  const day = eventDate ? new Date(eventDate + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
  return (
    <div className="qg-print">
      <h2>{title}</h2>
      <p>{business}{day ? ` · ${day}` : ""} · {t.headcount} coming, {t.maybePeople} maybe · printed {new Date().toLocaleDateString("en-US")}</p>
      <table>
        <thead><tr><th aria-label="Arrived" /><th>Name</th><th>Reply</th><th className="n">People</th><th>Email / mobile</th></tr></thead>
        <tbody>
          {list.map((g) => (
            <tr key={g.id}>
              <td className="box"><span aria-hidden="true">{g.checkedInAt ? "✓" : ""}</span></td>
              <td>{g.name ?? "Guest"}</td>
              <td>{replyLabel(g)}</td>
              <td className="n">{g.party}</td>
              <td>{[g.email, g.phone].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={5}>No guests yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
