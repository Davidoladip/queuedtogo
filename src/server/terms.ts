import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { TERMS_VERSION } from "@/lib/legal";
import { clientIp, keyedHash } from "@/server/abuse";

/** Whether this person has accepted the current Terms of Service. Errs towards "yes" if the check can't run. */
export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return true;
  const { data, error } = await admin.from("terms_acceptances").select("id").eq("user_id", userId).eq("version", TERMS_VERSION).limit(1);
  return error ? true : (data?.length ?? 0) > 0;
}

/** Records that this person accepted the current Terms (version, time and a hash of their IP, never the IP). */
export async function recordTermsAcceptance(userId: string, context: "onboarding" | "update", orgId?: string | null): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return false;
  const ip = await clientIp();
  const ipHash = ip ? keyedHash(ip, "terms-ip").slice(0, 32) : null;
  const { error } = await admin.from("terms_acceptances").insert({ user_id: userId, org_id: orgId ?? null, version: TERMS_VERSION, context, ip_hash: ipHash });
  return !error;
}
