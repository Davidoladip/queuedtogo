import { getMyWorkspaces, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { SectionTabs } from "@/components/shell/SectionTabs";
import { OrgSwitcher } from "@/components/shell/OrgSwitcher";
import { UserMenu } from "@/components/shell/UserMenu";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, org } = await requireWorkspace(orgSlug);
  const workspaces = await getMyWorkspaces();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  return (
    <>
      <header className="top">
        <div className="wrap top-inner">
          <Logo href={`/w/${org.slug}`} />
          <OrgSwitcher current={org.slug} orgs={workspaces.map((w) => ({ slug: w.slug, name: w.name }))} />
          <SectionTabs orgSlug={org.slug} />
          <div className="top-tools">
            <UserMenu email={user.email} name={profile?.full_name ?? null} orgSlug={org.slug} />
          </div>
        </div>
      </header>
      <main className="page wrap">{children}</main>
    </>
  );
}
