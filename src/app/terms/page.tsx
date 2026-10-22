import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, legalReady } from "@/lib/legal";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Texting terms and conditions" };

export default function TermsPage() {
  if (!legalReady()) notFound();
  const { operator, contactEmail, address, program, updated } = LEGAL;
  return (
    <LegalPage title="Texting terms and conditions" updated={updated}>
      <p>
        These terms cover the <b>{program}</b> text messages sent through QueuedToGo, a service operated by {operator}. QueuedToGo lets
        businesses take orders online for events and keep customers updated as each order is made.
      </p>

      <h2>What you&apos;ll receive</h2>
      <p>
        If you tick the box agreeing to text updates when you place an order, you&apos;ll get text messages about <b>that order only</b>: for
        example that it was received, is being made, or is ready to collect. Each message names the business you ordered from and may include
        a link to your order&apos;s tracking page. We don&apos;t send marketing or promotional texts.
      </p>

      <h2>How you agree</h2>
      <p>
        You agree by ticking the &ldquo;Text me updates about this order&rdquo; box on the order form before you place your order. The box
        is never ticked for you, and you don&apos;t have to agree in order to place an order.
      </p>

      <h2>How often</h2>
      <p>Message frequency varies with your order. Usually up to 6 messages per order.</p>

      <h2>Costs</h2>
      <p><b>Message and data rates may apply.</b> Check with your mobile carrier for details.</p>

      <h2>How to stop</h2>
      <p>
        <b>Reply STOP to any message to stop receiving texts.</b> We&apos;ll send one message confirming you&apos;ve opted out, and then no
        more. You can also reply UNSUBSCRIBE, CANCEL, END or QUIT. To start again, reply <b>START</b>.
      </p>

      <h2>Help</h2>
      <p>
        <b>Reply HELP for help.</b> You can also email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>, or contact the business you
        ordered from.
      </p>

      <h2>Carriers</h2>
      <p>Carriers are not liable for delayed or undelivered messages.</p>

      <h2>Privacy</h2>
      <p>
        How we handle your information is explained in our <Link href="/privacy">privacy policy</Link>. Your mobile number and your consent
        to receive texts are never shared with or sold to third parties or affiliates for marketing purposes.
      </p>

      <h2>Contact</h2>
      <p>
        {operator}
        {address ? <>, {address}</> : null}. Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
