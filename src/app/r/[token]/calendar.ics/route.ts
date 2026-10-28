import { icsFile } from "@/lib/rsvp";
import { calendarFor, loadRsvpByToken } from "@/lib/rsvp-data";
import { siteUrl } from "@/lib/urls";

/** The guest's event as a calendar file (Apple Calendar, Outlook and others). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await loadRsvpByToken(token);
  const cal = g && calendarFor(g, `${await siteUrl()}/r/${g.token}`);
  if (!g || !cal) return new Response("Not found", { status: 404 });
  const name = (g.form.slug || "event").replace(/[^a-z0-9-]/g, "") || "event";
  return new Response(icsFile(cal), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.ics"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
