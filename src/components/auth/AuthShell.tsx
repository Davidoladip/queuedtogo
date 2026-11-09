import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { LEGAL } from "@/lib/legal";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import "./auth.css";

export type PanelKind = "signin" | "signup" | "reset" | "invite" | "setup";

/**
 * The layout for pages outside the app (sign in, sign up, passwords, invitations, setup, errors):
 * the form on the left, and on wide screens a dark panel on the right showing what the page leads to.
 * Without a panel the content sits in the middle of the page.
 */
export function AuthShell({ panel, children, wide }: { panel?: PanelKind; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`au${panel ? "" : " au-solo"}`}>
      <div className="au-side">
        <header className="au-top"><Logo /></header>
        <main id="main" className={`au-main${wide ? " au-wide" : ""}`}>{children}</main>
        <footer className="au-legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Texting terms</Link>
          <a href={`mailto:${LEGAL.contactEmail}`}>Help: {LEGAL.contactEmail}</a>
        </footer>
      </div>
      {panel && <AuthPanel kind={panel} />}
    </div>
  );
}

function Ticket({ n, what, stage }: { n: string; what: string; stage: "new" | "making" | "ready" }) {
  return (
    <div className={`au-tk au-tk-${stage}`}>
      <b>{n}</b>
      <span>{what}</span>
      <i>{stage === "new" ? "New" : stage === "making" ? "Making" : "Ready"}</i>
    </div>
  );
}

function AuthPanel({ kind }: { kind: PanelKind }) {
  return (
    <aside className="au-panel" aria-label="About QueuedToGo">
      {kind === "signin" && (
        <>
          <div className="au-tks" aria-hidden="true">
            <Ticket n="QTG-1043" what="Toiletry bag, red" stage="new" />
            <Ticket n="QTG-1039" what="Tote bag × 2" stage="making" />
            <Ticket n="QTG-1037" what="Toiletry bag, blue" stage="ready" />
          </div>
          <h2>Welcome back.</h2>
          <p>Your board is where you left it: every order, who&apos;s on it, and what&apos;s due first.</p>
        </>
      )}
      {kind === "signup" && (
        <>
          <h2>Set up your first event tonight.</h2>
          <ol className="au-steps">
            <li><b>Make your order form.</b> Questions, sizes, colours and photos, in your brand.</li>
            <li><b>Print the QR code.</b> Customers order from their phone at your table.</li>
            <li><b>Work from your board.</b> Customers hear from you when their order is ready.</li>
          </ol>
          <p className="au-note">Free plan, no card needed. Paid plans from ${PLANS.starter.price} a month include a {TRIAL_DAYS}-day free trial.</p>
        </>
      )}
      {kind === "reset" && (
        <>
          <div className="au-tks" aria-hidden="true"><div className="au-tk au-tk-key"><b>Reset link</b><span>Works once, for 1 hour</span></div></div>
          <h2>Locked out? It happens.</h2>
          <p>We&apos;ll email you a link to choose a new password. Your forms and orders stay exactly as they are.</p>
        </>
      )}
      {kind === "invite" && (
        <>
          <div className="au-tks" aria-hidden="true">
            <Ticket n="QTG-1039" what="Tote bag × 2" stage="making" />
            <Ticket n="QTG-1037" what="Toiletry bag, blue" stage="ready" />
          </div>
          <h2>Your team, one board.</h2>
          <p>Everyone sees the same orders as they move along. Owners and admins manage settings; members work on orders.</p>
        </>
      )}
      {kind === "setup" && (
        <>
          <h2>Almost there.</h2>
          <ol className="au-steps">
            <li className="au-now"><b>Name your business.</b> This is what customers see on your forms and texts.</li>
            <li><b>Make your first form.</b> Start from a look and change anything.</li>
            <li><b>Share the link or QR code.</b> Orders start landing on your board.</li>
          </ol>
        </>
      )}
    </aside>
  );
}
