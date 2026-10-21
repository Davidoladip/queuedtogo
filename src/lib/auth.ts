import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type OrgRole = Database["public"]["Enums"]["org_role"];
export type SessionUser = { id: string; email: string };
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  country: string;
  timezone: string;
  currency: string;
  role: OrgRole;
};

/** The signed-in user, verified on the server (getClaims checks the token signature). */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    return { id: data.claims.sub, email: String(data.claims.email ?? "") };
  } catch {
    return null;
  }
});

export async function requireUser(next = "/"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Every business the user belongs to, with their role. RLS limits this to their own memberships. */
export const getMyWorkspaces = cache(async (): Promise<Workspace[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations!inner(id, name, slug, country, timezone, currency)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load your businesses: ${error.message}`);
  return (data ?? []).map((m) => ({ ...m.organizations, role: m.role }));
});

/**
 * The business in the URL, if the signed-in user is a member. Otherwise a 404, so the page
 * never reveals whether another business exists.
 */
export const requireWorkspace = cache(async (orgSlug: string): Promise<{ user: SessionUser; org: Workspace }> => {
  const user = await requireUser(`/w/${orgSlug}`);
  const org = (await getMyWorkspaces()).find((w) => w.slug === orgSlug);
  if (!org) notFound();
  return { user, org };
});

export const canManage = (role: OrgRole) => role === "owner" || role === "admin";
