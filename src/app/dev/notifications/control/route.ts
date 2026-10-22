// Resets the Notifications harness. 404 unless QTG_DEV_HARNESS=1 (never on Vercel).
import { notFound } from "next/navigation";
import { harnessEnabled } from "../../sample";
import { resetNotify } from "../store";

export async function POST() {
  if (!harnessEnabled()) notFound();
  resetNotify();
  return Response.json({ ok: true });
}
