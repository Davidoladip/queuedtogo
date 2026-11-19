import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { saveSquareAccount, squareConnected, squareExchangeCode, squareMerchantDetails } from "@/server/payments/square";

/**
 * Square sends the business owner back here after they approve QueuedToGo. The one-time state must match one we
 * issued to this same signed-in user in the last 15 minutes, for the same business; otherwise nothing is saved.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const back = (slug: string | null, q: string) => NextResponse.redirect(new URL(slug ? `/w/${slug}/payments?${q}` : `/?${q}`, origin));
  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";
  const admin = adminClient();
  const user = await getUser();
  if (!admin || !user || !squareConnected() || state.length < 20 || state.length > 200) return back(null, "square=failed");

  const { data: row } = await admin.from("payment_oauth_states")
    .delete().eq("state_hash", createHash("sha256").update(state).digest("hex")).eq("provider", "square")
    .select("org_id, user_id, expires_at").maybeSingle();
  if (!row || row.user_id !== user.id || Date.parse(row.expires_at) < Date.now()) return back(null, "square=expired");
  const { data: org } = await admin.from("organizations").select("slug").eq("id", row.org_id).single();
  const { data: member } = await admin.from("organization_members").select("role").eq("org_id", row.org_id).eq("user_id", user.id).maybeSingle();
  if (!org || !member || !["owner", "admin"].includes(member.role)) return back(null, "square=failed");
  if (!code || searchParams.get("error")) return back(org.slug, "square=cancelled");

  try {
    const tokens = await squareExchangeCode(code);
    const details = await squareMerchantDetails(tokens.accessToken, tokens.merchantId);
    await saveSquareAccount(admin, row.org_id, user.id, tokens, details);
    return back(org.slug, "square=connected");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    console.error("square connect", msg);
    return back(org.slug, msg.includes("another QueuedToGo business") ? "square=taken" : "square=failed");
  }
}
