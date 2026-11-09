import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyWorkspaces, getUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice } from "@/components/ui/Notice";
import { Landing } from "@/components/home/Landing";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "QueuedToGo: order forms and updates for live events" },
  description: "Take orders at your event with a QR-code form, work through them on a production board, and text customers when they're ready. RSVP invitations too. Free to start.",
  alternates: { canonical: "/" },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getUser();
  if (user) {
    const workspaces = await getMyWorkspaces();
    if (!workspaces.length) redirect("/onboarding");
    if (workspaces.length === 1 && !sp.left && !sp.deleted && !sp.password) redirect(`/w/${workspaces[0].slug}`);
    return (
      <AuthShell>
          {sp.password && <Notice tone="success">Your password is updated.</Notice>}
          {sp.left && <Notice tone="success">You left the business.</Notice>}
          {sp.deleted && <Notice tone="success">The business was deleted.</Notice>}
          <h1>Choose a business</h1>
          <div className="stack" style={{ gap: 8 }}>
            {workspaces.map((w) => (
              <Link key={w.id} href={`/w/${w.slug}`} className="btn" style={{ justifyContent: "space-between" }}>
                <span>{w.name}</span>
                <span className="pill plain">{w.role}</span>
              </Link>
            ))}
          </div>
          <Link href="/onboarding" className="btn ghost">+ Create another business</Link>
      </AuthShell>
    );
  }

  return <Landing />;
}
