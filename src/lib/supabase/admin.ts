import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Supabase client with the secret key, for the server only (it bypasses row level security).
 * Used for exactly two things: calling submit_form() and storing customer uploads in the private bucket.
 * Returns null when SUPABASE_SECRET_KEY isn't set, so public forms report that ordering is switched off.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient<Database>(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
