import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, legalReady } from "@/lib/legal";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  if (!legalReady()) notFound();
  const { operator, contactEmail, address, updated } = LEGAL;
  return (
    <LegalPage title="Privacy policy" updated={updated}>
      <p>
        QueuedToGo is operated by {operator}. It lets businesses take orders online for events, make those orders, and keep their customers
        updated. This policy explains what information we handle and how.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><b>When you place an order:</b> your name, mobile number, email address, your answers on the order form, any files you upload, and whether you agreed to text updates.</li>
        <li><b>Business accounts:</b> the name and email address of each team member who signs in.</li>
        <li><b>Technical information:</b> a one-way scrambled version of your IP address, used only to block abuse, and your browser type. We don&apos;t store your IP address itself.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To pass your order to the business you ordered from, so they can make it.</li>
        <li>To show your order&apos;s progress on its private tracking page.</li>
        <li>If you agreed, to text you updates about your order (see the <Link href="/terms">texting terms</Link>).</li>
        <li>To keep the service secure and prevent spam.</li>
      </ul>

      <h2>Text messages and your mobile number</h2>
      <p>
        <b>We do not share, sell or rent your mobile number or your consent to receive texts with third parties or affiliates for marketing or
        promotional purposes.</b> Text messaging originator opt-in data and consent are never shared with any third party, except the
        service providers that deliver the messages for us (such as our messaging provider, Twilio), who may use them only to deliver our messages.
      </p>
      <p>You can stop texts at any time by replying STOP.</p>

      <h2>Who can see your information</h2>
      <p>
        Only the business you ordered from, and the people on its team, can see your order and contact details. One business can&apos;t see
        another business&apos;s orders. We use trusted service providers to run QueuedToGo: hosting (Vercel), database and file storage
        (Supabase) and text messaging (Twilio). They process information only on our behalf.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order information is kept for as long as the business that took the order keeps its account, or until they delete it. Ask the business,
        or us, to delete your information.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask to see, correct or delete your information by emailing <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. Reply STOP to
        any text to stop texts.
      </p>

      <h2>Security</h2>
      <p>Information is sent over encrypted connections, and uploaded files are stored privately and shared only through short-lived links.</p>

      <h2>Contact</h2>
      <p>
        {operator}
        {address ? <>, {address}</> : null}. Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
