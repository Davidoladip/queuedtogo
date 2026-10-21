import type { Metadata } from "next";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui/Notice";
import { BusinessForm, DeleteBusiness, InviteForm, MemberRow, ProfileForm } from "./SettingsForms";
import { cancelInvitation } from "@/server/actions/organizations";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { user, org } = await requireWorkspace(orgSlug);
  const manage = canManage(org.role);
  const supabase = await createClient();

  const [{ data: members, error: mErr }, { data: invites }, { data: profile }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, created_at, profiles(full_name, email)").eq("org_id", org.id).order("created_at"),
    manage
      ? supabase.from("organization_invitations").select("id, email, role, expires_at, created_at").eq("org_id", org.id).is("accepted_at", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; expires_at: string; created_at: string }[] }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (mErr) throw new Error(mErr.message);
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Settings</h1>
          <p>Your business details, your team and your account.</p>
        </div>
      </div>
      {sp.saved === "business" && <div style={{ marginBottom: 16 }}><Notice tone="success">Business settings saved.</Notice></div>}
      <div className="grid2">
        <section className="panel" aria-labelledby="biz">
          <h2 id="biz">Business</h2>
          <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>{manage ? "Owners and admins can change these." : "Only owners and admins can change these."}</p>
          <BusinessForm org={org} disabled={!manage} />
        </section>

        <section className="panel" id="account" aria-labelledby="acct">
          <h2 id="acct">Your account</h2>
          <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>Signed in as {user.email}. You are {org.role === "admin" ? "an admin" : `the ${org.role}`} here{org.role === "member" ? "" : ""}.</p>
          <ProfileForm fullName={profile?.full_name ?? ""} />
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="team">
        <div className="panel-head">
          <div>
            <h2 id="team">Team</h2>
            <p className="muted" style={{ fontSize: 14 }}>Owners manage everything. Admins manage the team and settings. Members work on forms and jobs.</p>
          </div>
        </div>
        <div className="tablewrap">
          <table className="list">
            <thead><tr><th>Person</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  orgId={org.id}
                  userId={m.user_id}
                  name={m.profiles?.full_name ?? null}
                  email={m.profiles?.email ?? ""}
                  role={m.role}
                  isMe={m.user_id === user.id}
                  myRole={org.role}
                  lastOwner={m.role === "owner" && owners <= 1}
                />
              ))}
            </tbody>
          </table>
        </div>

        {manage && (
          <div className="grid2" style={{ marginTop: 18 }}>
            <div>
              <p className="section-label" style={{ marginBottom: 10 }}>Invite someone</p>
              <InviteForm orgId={org.id} />
            </div>
            <div>
              <p className="section-label" style={{ marginBottom: 10 }}>Open invitations</p>
              {invites?.length ? (
                <div className="stack" style={{ gap: 8 }}>
                  {invites.map((i) => (
                    <form key={i.id} action={cancelInvitation} className="linkbox" style={{ justifyContent: "space-between" }}>
                      <input type="hidden" name="id" value={i.id} />
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        {i.email} <span className="pill plain">{i.role}</span>
                        <br />
                        <small className="muted">
                          {new Date(i.expires_at) < new Date() ? "Expired" : `Expires ${new Date(i.expires_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`}
                        </small>
                      </span>
                      <button className="btn small" type="submit">Cancel</button>
                    </form>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 14 }}>No open invitations.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {org.role === "owner" && (
        <section className="panel" style={{ marginTop: 16, borderColor: "var(--bad)" }} aria-labelledby="danger">
          <h2 id="danger">Delete this business</h2>
          <p className="muted" style={{ marginBottom: 14, fontSize: 14 }}>
            Permanently deletes {org.name}, including its forms, submissions, customers, jobs and history. This cannot be undone.
          </p>
          <DeleteBusiness orgId={org.id} slug={org.slug} />
        </section>
      )}
    </>
  );
}
