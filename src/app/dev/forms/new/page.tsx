import { connection } from "next/server";
import { notFound } from "next/navigation";
import { assetBaseFor } from "@/lib/design/engine";
import { flyerSpec } from "@/lib/design/flyer";
import { googleFontsUrls } from "@/lib/design/fonts";
import { TEMPLATES, TEMPLATE_GROUPS, templateByKey } from "@/lib/templates";
import { TemplateGallery, type GalleryItem } from "@/components/forms/TemplateGallery";
import { harnessEnabled } from "../../sample";
import "@/components/forms/forms.css";

/** Development harness: the template gallery. Creating a form needs a real account, so it isn't wired here. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevNewFormPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const assetBase = assetBaseFor(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co");
  const items: GalleryItem[] = TEMPLATES.map((t) => {
    const form = t.build();
    return { key: t.key, group: t.group, name: t.name, blurb: t.blurb, example: t.example, form, spec: flyerSpec(form.design, form.settings, assetBase) };
  });
  const fonts = googleFontsUrls(items.flatMap((i) => [i.spec.titleFontKey, i.spec.bodyFontKey]));
  return (
    <main className="page wrap">
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <div className="view-head"><div><h1>Choose a starting point</h1><p>Development harness.</p></div></div>
      <TemplateGallery orgId="00000000-0000-4000-8000-000000000001" groups={TEMPLATE_GROUPS} items={items} assetBase={assetBase} initial={templateByKey(sp.template ?? "")?.key ?? null} />
    </main>
  );
}
