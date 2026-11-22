import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { assetBaseFor, normalizeDesign, normalizeSettings } from "@/lib/design/engine";
import { flyerSpec } from "@/lib/design/flyer";
import { googleFontsUrls } from "@/lib/design/fonts";
import { TEMPLATES } from "@/lib/templates";
import { FormsBoard } from "@/components/forms/FormsBoard";
import { Notice } from "@/components/ui/Notice";
import "@/components/forms/forms.css";

export const metadata: Metadata = { title: "Event forms" };


export default async function FormsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [{ data: forms, error }, { data: subs }, { data: openJobs }] = await Promise.all([
    supabase.from("forms").select("id, title, slug, status, event_date, venue, submit_label, settings, design, updated_at")
      .eq("org_id", org.id).order("updated_at", { ascending: false }),
    supabase.from("form_submissions").select("form_id").eq("org_id", org.id).range(0, 9999),
    supabase.from("jobs").select("form_id").eq("org_id", org.id).is("completed_at", null).range(0, 9999),
  ]);
  if (error) throw new Error(error.message);
  const tally = (rows: { form_id: string | null }[] | null) => (rows ?? []).reduce((m, r) => (r.form_id ? m.set(r.form_id, (m.get(r.form_id) ?? 0) + 1) : m), new Map<string, number>());
  const subCount = tally(subs), openCount = tally(openJobs);
  const assetBase = assetBaseFor(env.supabaseUrl);
  const cards = forms.map((f) => {
    const settings = normalizeSettings(f.settings);
    return { f, rsvp: settings.mode === "rsvp", spec: flyerSpec(normalizeDesign(f.design), settings, assetBase) };
  });
  // When there are no forms yet, three contrasting templates invite a first one.
  const starters = cards.length ? [] : ["market-stall", "concert-night", "wedding"].map((k) => TEMPLATES.find((t) => t.key === k)!).map((t) => {
    const m = t.build();
    return { t, m, spec: flyerSpec(m.design, m.settings, assetBase) };
  });
  const fonts = googleFontsUrls([...cards.map((c) => c.spec), ...starters.map((s) => s.spec)].flatMap((s) => [s.titleFontKey, s.bodyFontKey]));
  const day = (d: string | null) => d ? new Date(d + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <>
      {fonts.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <div className="view-head">
        <div>
          <h1>Event forms</h1>
          <p>Each event gets its own themed form. Every order becomes a job on the production board.</p>
        </div>
        {cards.length > 0 && <Link className="btn primary" href={`/w/${org.slug}/forms/new`}>New event form</Link>}
      </div>
      {sp.deleted && <div className="fg-notice"><Notice tone="success">Form deleted.</Notice></div>}
      {sp.notdeleted && <div className="fg-notice"><Notice tone="error">That form wasn&apos;t deleted. Only owners and admins can delete forms.</Notice></div>}

      <FormsBoard orgSlug={org.slug} cards={cards.map(({ f, rsvp, spec }) => ({
        id: f.id, title: f.title, slug: f.slug, status: f.status, submitLabel: f.submit_label, rsvp, spec,
        when: [day(f.event_date), f.venue].filter(Boolean).join(", "), count: subCount.get(f.id) ?? 0, open: openCount.get(f.id) ?? 0,
      }))} starters={starters.map(({ t, m, spec }) => ({ key: t.key, name: t.name, title: m.title, meta: m.venue, button: m.submitLabel, spec }))} />
    </>
  );
}
