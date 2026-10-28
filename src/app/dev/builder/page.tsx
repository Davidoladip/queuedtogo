import { notFound } from "next/navigation";
import { Builder } from "@/components/builder/Builder";
import { harnessEnabled, sampleForm } from "../sample";
import { sampleRsvpForm } from "../rsvp/sample";

/** Development harness for browser tests. Returns 404 unless QTG_DEV_HARNESS=1 (never on Vercel). */
export default async function DevBuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const published = sp.published === "1";
  return (
    <main className="page wrap">
      <Builder initial={sp.rsvp === "1" ? sampleRsvpForm() : sampleForm()} orgId="7bb8b915-0b07-453d-90c3-56548f7b836f" orgSlug="demo" orgName="Demo Business"
        assetBase="/dev/assets" siteUrl="http://localhost:3000" status={published ? "live" : "draft"} publishedVersion={published ? 1 : 0}
        changedSincePublish canDelete={false} demo
        brand={["#3346D3", "#E8633A", "#12306B", "#FFC93C"]} canEditBrand otherForms={[{ id: "11111111-1111-4111-8111-111111111111", title: "Northgate Sports Day" }]} />
    </main>
  );
}
