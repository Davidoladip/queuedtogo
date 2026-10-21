import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyWorkspaces, getUser } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";
import { Notice } from "@/components/ui/Notice";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getUser();
  if (user) {
    const workspaces = await getMyWorkspaces();
    if (!workspaces.length) redirect("/onboarding");
    if (workspaces.length === 1 && !sp.left && !sp.deleted && !sp.password) redirect(`/w/${workspaces[0].slug}`);
    return (
      <div className="auth-shell wrap">
        <div className="auth-card">
          <Logo />
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
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell wrap">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <Logo />
        <h1 style={{ fontSize: 30 }}>One submission. One production workflow. Every customer updated.</h1>
        <p className="muted">
          Build an order form for each live event, turn every submission into a job on your production board, and
          keep customers updated as their order moves along.
        </p>
        <div className="row">
          <Link href="/signup" className="btn primary block">Create an account</Link>
          <Link href="/login" className="btn block">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
