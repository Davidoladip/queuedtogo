import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { assetBaseFor } from "@/lib/design/engine";
import { flyerSpec } from "@/lib/design/flyer";
import { googleFontsUrls } from "@/lib/design/fonts";
import { TEMPLATES, TEMPLATE_GROUPS, templateByKey } from "@/lib/templates";
import { TemplateGallery, type GalleryItem } from "@/components/forms/TemplateGallery";
import "@/components/forms/forms.css";

export const metadata: Metadata = { title: "New event form" };

export default async function NewFormPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ template?: string }> }) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const assetBase = assetBaseFor(env.supabaseUrl);
  const items: GalleryItem[] = TEMPLATES.map((t) => {
    const form = t.build();
    return { key: t.key, group: t.group, name: t.name, blurb: t.blurb, example: t.example, form, spec: flyerSpec(form.design, form.settings, assetBase) };
  });
  const fonts = googleFontsUrls(items.flatMap((i) => [i.spec.titleFontKey, i.spec.bodyFontKey]));
  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={`/w/${org.slug}/forms`}>Event forms</Link><span aria-hidden="true">/</span><span>New</span></nav>
      <div className="view-head">
        <div>
          <h1>Choose a starting point</h1>
          <p>Each template comes with questions and a look that suit the event. Preview it, give your event a name, and change anything you like in the builder.</p>
        </div>
      </div>
      <TemplateGallery orgId={org.id} groups={TEMPLATE_GROUPS} items={items} assetBase={assetBase} initial={templateByKey(sp.template ?? "")?.key ?? null} />
    </>
  );
}
