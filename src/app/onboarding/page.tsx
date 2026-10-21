import type { Metadata } from "next";
import Link from "next/link";
import { getMyWorkspaces, requireUser } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { CreateOrgForm } from "./CreateOrgForm";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const workspaces = await getMyWorkspaces();
  return (
    <div className="auth-shell wrap">
      <main className="auth-card" style={{ maxWidth: 480 }}>
        <Logo />
        <div>
          <h1>{workspaces.length ? "Create another business" : "Set up your business"}</h1>
          <p className="muted">Each business has its own forms, production board and team. You can invite people once it&apos;s set up.</p>
        </div>
        <CreateOrgForm />
        <div className="ticket-edge" />
        <p className="auth-foot">
          Signed in as {user.email}.{" "}
          {workspaces.length ? <Link href="/">Back to your businesses</Link> : "Joining a team instead? Open the invitation link you were sent."}
        </p>
      </main>
    </div>
  );
}
