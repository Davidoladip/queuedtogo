import Link from "next/link";

/** The strip above each demo: says it's a demo and links between the demos and home. */
export function DemoBar({ current }: { current: "style-and-sip" | "embroidery" | "invitation" | "track" }) {
  return (
    <div className="demo-bar" role="note">
      <p><b>Demo.</b> A real ThreadToGo form. Fill it in as a customer would; nothing you type is saved or sent.</p>
      <nav aria-label="Demos">
        {current !== "style-and-sip" && <Link href="/demo">Style and Sip</Link>}
        {current !== "embroidery" && <Link href="/demo/embroidery">Live embroidery</Link>}
        {current !== "invitation" && <Link href="/demo/invitation">Invitation</Link>}
        <Link href="/" className="demo-home">QueuedToGo home</Link>
      </nav>
    </div>
  );
}
