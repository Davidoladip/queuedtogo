import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { assetBaseFor } from "@/lib/design/engine";
import { formFromPublished } from "@/lib/design/fromDb";
import { PublicOrderForm } from "./PublicOrderForm";

type PublicForm = { form_id: string; org_name: string; org_slug: string; status: "live" | "closed"; version: number | null; config: Record<string, unknown> | null; title?: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

const load = cache(async (orgSlug: string, formSlug: string): Promise<PublicForm | null> => {
  if (!SLUG.test(orgSlug) || !SLUG.test(formSlug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_form", { p_org_slug: orgSlug, p_form_slug: formSlug });
  if (error) throw new Error(error.message);
  return (data as PublicForm | null) ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string; formSlug: string }> }): Promise<Metadata> {
  const { orgSlug, formSlug } = await params;
  const form = await load(orgSlug, formSlug);
  const title = typeof form?.config?.title === "string" ? form.config.title : "Order form";
  return { title: form ? `${title} · ${form.org_name}` : "Order form", robots: { index: false } };
}

/** Public order form. Renders only the published snapshot, never the draft. */
export default async function PublicFormPage({ params }: { params: Promise<{ orgSlug: string; formSlug: string }> }) {
  const { orgSlug, formSlug } = await params;
  const form = await load(orgSlug, formSlug);
  if (!form) notFound();
  // A closed form has no config in the response; show its heading from a minimal model.
  const model = formFromPublished(form.form_id, formSlug, form.config ?? { title: "Order form" });
  return (
    <div className="pf-page">
      <PublicOrderForm
        form={model}
        orgSlug={orgSlug}
        formSlug={formSlug}
        orgName={form.org_name}
        assetBase={assetBaseFor(env.supabaseUrl)}
        version={form.version ?? undefined}
        orderingOn={Boolean(process.env.SUPABASE_SECRET_KEY)}
        closedMessage={form.status === "closed" ? `${form.org_name} is no longer taking orders through this form.` : null}
      />
    </div>
  );
}
