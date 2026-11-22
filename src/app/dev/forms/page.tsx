import { connection } from "next/server";
import { notFound } from "next/navigation";
import { assetBaseFor } from "@/lib/design/engine";
import { flyerSpec } from "@/lib/design/flyer";
import { googleFontsUrls } from "@/lib/design/fonts";
import { sampleForm, SAMPLE_FORMS } from "@/lib/demo";
import { TEMPLATES } from "@/lib/templates";
import { FormsBoard, type BoardCard } from "@/components/forms/FormsBoard";
import { harnessEnabled } from "../sample";

/** Development harness: the Event forms board with sample forms (templates plus the real demo forms). 404 unless QTG_DEV_HARNESS=1. */
export default async function DevFormsPage({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const assetBase = assetBaseFor(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co");
  const statuses = ["live", "draft", "live", "closed", "draft", "live", "live", "draft", "live", "draft", "live", "draft"];
  const forms = [...TEMPLATES.map((t) => t.build()), ...(Object.keys(SAMPLE_FORMS) as (keyof typeof SAMPLE_FORMS)[]).map((k) => sampleForm(k))];
  const cards: BoardCard[] = sp.empty ? [] : forms.map((f, i) => ({
    id: `0000000${i}-0000-4000-8000-000000000000`.slice(0, 36), title: f.title, slug: f.slug, status: statuses[i % statuses.length], submitLabel: f.submitLabel,
    rsvp: f.settings.mode === "rsvp", spec: flyerSpec(f.design, f.settings, assetBase),
    when: [i % 3 ? "Sat, Dec 6, 2026" : "", f.venue].filter(Boolean).join(", "), count: (i * 7) % 23, open: (i * 3) % 5,
  }));
  const starters = ["market-stall", "concert-night", "wedding"].map((k) => TEMPLATES.find((t) => t.key === k)!).map((t) => {
    const m = t.build();
    return { key: t.key, name: t.name, title: m.title, meta: m.venue, button: m.submitLabel, spec: flyerSpec(m.design, m.settings, assetBase) };
  });
  const fonts = googleFontsUrls([...cards.map((c) => c.spec), ...starters.map((s) => s.spec)].flatMap((s) => [s.titleFontKey, s.bodyFontKey]));
  return (
    <main className="page wrap">
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <div className="view-head"><div><h1>Event forms</h1><p>Development harness.</p></div></div>
      <FormsBoard orgSlug="threadtogo" base="/dev" cards={cards} starters={starters} />
    </main>
  );
}
