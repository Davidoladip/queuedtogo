import Link from "next/link";

/** The strip above each demo: says it's a demo and links between the demos and home. */
export function DemoBar({ current }: { current: "order" | "invitation" | "track" }) {
  return (
    <div className="demo-bar" role="note">
      <p><b>Demo.</b> Fill it in as a customer would. Nothing you type is saved or sent.</p>
      <nav aria-label="Demos">
        {current !== "order" && <Link href="/demo">Order form</Link>}
        {current !== "invitation" && <Link href="/demo/invitation">Invitation</Link>}
        <Link href="/" className="demo-home">QueuedToGo home</Link>
      </nav>
    </div>
  );
}
