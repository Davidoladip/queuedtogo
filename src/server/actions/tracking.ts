"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** The customer's "Stop updates" button. The private tracking link is the only thing needed. */
export async function stopUpdates(token: string): Promise<{ ok: boolean }> {
  if (typeof token !== "string" || !/^[0-9a-f]{32,128}$/.test(token)) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stop_updates", { p_token: token });
  if (error) return { ok: false };
  revalidatePath(`/t/${token}`);
  return { ok: Boolean(data) };
}
