import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { siteUrl } from "@/lib/urls";
import { assetBaseFor } from "@/lib/design/engine";
import { cc } from "@/lib/design/color";

const DEFAULT_BRAND = ["#3346D3", "#E8633A", "#12306B", "#FFC93C"];
import { formFromRows } from "@/lib/design/fromDb";
import { Builder } from "@/components/builder/Builder";

export const metadata: Metadata = { title: "Form builder" };

export default async function FormBuilderPage({ params }: { params: Promise<{ orgSlug: string; formId: string }> }) {
  const { orgSlug, formId } = await params;
  const { org } = await requireWorkspace(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(formId)) notFound();
  const supabase = await createClient();
  const [{ data: row, error }, { data: fields, error: fErr }, { data: orgRow }, { data: others }] = await Promise.all([
    supabase
      .from("forms")
      .select("id, org_id, title, slug, status, event_date, venue, intro, thanks, submit_label, settings, design, published_version, published_at, updated_at")
      .eq("id", formId)
      .eq("org_id", org.id)
      .maybeSingle(),
    supabase
      .from("form_fields")
      .select("id, type, label, help, placeholder, required, options, config, position")
      .eq("form_id", formId)
      .order("position"),
    supabase.from("organizations").select("brand").eq("id", org.id).maybeSingle(),
    supabase.from("forms").select("id, title").eq("org_id", org.id).neq("id", formId).order("updated_at", { ascending: false }).limit(50),
  ]);
  if (error || fErr) throw new Error((error ?? fErr)!.message);
  if (!row) notFound();

  const brandRaw = orgRow?.brand && typeof orgRow.brand === "object" && !Array.isArray(orgRow.brand) ? (orgRow.brand as { colors?: unknown }).colors : null;
  const brand = Array.isArray(brandRaw) ? brandRaw.map(cc).filter((c): c is string => !!c).slice(0, 18) : DEFAULT_BRAND;
  const changed = row.published_at ? new Date(row.updated_at).getTime() - new Date(row.published_at).getTime() > 2000 : true;
  return (
    <Builder
      initial={formFromRows(row, fields ?? [])}
      orgId={org.id}
      orgSlug={org.slug}
      orgName={org.name}
      assetBase={assetBaseFor(env.supabaseUrl)}
      siteUrl={await siteUrl()}
      status={row.status}
      publishedVersion={row.published_version}
      changedSincePublish={changed}
      canDelete={canManage(org.role)}
      brand={brand}
      canEditBrand={canManage(org.role)}
      otherForms={others ?? []}
    />
  );
}
