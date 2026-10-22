import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="wrap" style={{ maxWidth: 760, margin: "0 auto", paddingBlock: 32 }}>
      <Logo />
      <article className="panel legal" style={{ marginTop: 20 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>{title}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Last updated {updated}</p>
        {children}
      </article>
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
        <Link href="/terms">Texting terms</Link> · <Link href="/privacy">Privacy policy</Link>
      </p>
    </div>
  );
}
