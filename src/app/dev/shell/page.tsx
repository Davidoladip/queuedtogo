import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { OrgSwitcher } from "@/components/shell/OrgSwitcher";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { UserMenu } from "@/components/shell/UserMenu";
import { harnessEnabled } from "../sample";

/** Development harness: the signed-in workspace header with sample data. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevShellPage({ searchParams }: { searchParams: Promise<{ orgs?: string; name?: string }> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const q = await searchParams;
  const orgs = q.orgs === "2" ? [{ slug: "threadtogo", name: "ThreadToGo" }, { slug: "second", name: "Second Business" }] : [{ slug: "threadtogo", name: "ThreadToGo" }];
  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <Logo href="/dev/shell" />
          <OrgSwitcher current="threadtogo" orgs={orgs} />
          <SectionTabs orgSlug="threadtogo" />
          <div className="top-tools">
            <UserMenu email="david.oladipupo@example.com" name={q.name ?? "David Oladipupo"} orgSlug="threadtogo" />
          </div>
        </div>
      </header>
      <main className="page wrap"><h1>Header harness</h1></main>
    </>
  );
}
