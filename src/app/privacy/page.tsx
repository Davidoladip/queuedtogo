import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, legalReady } from "@/lib/legal";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy", description: "How QueuedToGo, operated by ThreadToGo LLC, collects, uses and protects the information of businesses and their customers.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  if (!legalReady()) notFound();
  const { operator, contactEmail, address, privacyUpdated } = LEGAL;
  const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  return (
    <LegalPage title="Privacy policy" updated={privacyUpdated}>
      <p>
        QueuedToGo is operated by {operator}. It lets businesses and event hosts take orders, sell tickets and collect RSVPs online, make
        those orders, and keep their customers and guests updated. This policy explains what information we handle, why, who we share it
        with, and the choices you have.
      </p>
      <p>
        <b>Two roles.</b> For the businesses and hosts who sign up (&ldquo;account holders&rdquo;), we decide how their account information is
        used. For the people who fill in a business&apos;s form (&ldquo;customers&rdquo;), the business decides what to collect and how to use it,
        and we process that information on the business&apos;s behalf. Questions about how a business uses your order are best sent to that
        business; we will help.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <b>When you place an order or RSVP:</b> your name, mobile number and email address, your answers on the form, any files you upload,
          the items or tickets you choose, and whether you agreed to text updates. If the form takes payment, you pay on Stripe&apos;s or
          Square&apos;s own page: we receive the payment&apos;s status and amount, never your full card number.
        </li>
        <li>
          <b>Account holders:</b> the name and email address of each person who signs in (or the name and email Google shares if you sign in
          with Google), the business&apos;s name and settings, its forms and images, its plan and billing history, and a record of when you
          accepted our Terms of Service. Card details for plans are handled by Stripe.
        </li>
        <li>
          <b>Technical information:</b> a one-way scrambled (hashed) version of your IP address, used to stop abuse and to record agreements,
          and basic browser information. We don&apos;t store your IP address itself. We keep a security log of suspicious activity, such as
          repeated failed sign-ins, as hashes only, for 90 days.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To pass your order or RSVP to the business, so they can make it, and to show its progress on its private tracking page.</li>
        <li>If you agreed, to text you updates about your order or RSVP (see the <Link href="/terms">texting terms</Link>), and to email you about it.</li>
        <li>To run accounts: sign-in, billing, receipts, and important notices about the service.</li>
        <li>To keep QueuedToGo secure, prevent spam and fraud, and meet our legal obligations.</li>
      </ul>
      <p>We do not sell personal information, share it for cross-context behavioural advertising, or use it for targeted advertising.</p>

      <h2>Text messages and your mobile number</h2>
      <p>
        <b>We do not share, sell or rent your mobile number or your consent to receive texts with third parties or affiliates for marketing or
        promotional purposes.</b> Text messaging originator opt-in data and consent are never shared with any third party, except the
        service providers that deliver the messages for us (such as our messaging provider, Twilio), who may use them only to deliver our messages.
      </p>
      <p>You can stop texts at any time by replying STOP, or by telling us in any other way.</p>

      <h2>Who can see your information</h2>
      <p>
        Only the business you ordered from, and the people on its team, can see your order and contact details. One business can&apos;t see
        another business&apos;s orders. We use service providers that process information only on our behalf and under contract:
      </p>
      <ul>
        <li>Vercel (hosting) and Supabase (database, sign-in and file storage);</li>
        <li>Twilio (text messages and email delivery);</li>
        <li>Stripe and Square (payments; when you pay a business, you also deal with them under their own privacy policies);</li>
        <li>Google (optional sign-in with Google, and the web fonts our pages load, which means your browser contacts Google&apos;s servers);</li>
        <li>Cloudflare (Turnstile, a check that stops automated spam on some forms).</li>
      </ul>
      <p>
        We may also disclose information if the law requires it, to protect people&apos;s safety or our rights, or as part of a merger or sale
        of our business (in which case this policy continues to apply).
      </p>

      <h2>Cookies and similar technology</h2>
      <p>
        We use only the cookies needed to keep you signed in and secure. We don&apos;t use advertising or analytics cookies or tracking pixels.
        The form builder remembers a few of your display preferences in your browser&apos;s local storage.
      </p>

      <h2>Files and images</h2>
      <p>
        Files customers upload with an order are stored privately and shared with the business only through short-lived links. Images a
        business adds to its form (such as a logo or artwork) are public, because they appear on the published form.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Order and RSVP information is kept for as long as the business that collected it keeps it in its account, or until it deletes it or
        closes its account; after that we delete it within a reasonable time, except where we must keep records by law (for example billing
        records). Checkouts that are never paid expire automatically, and any files uploaded with them are deleted. Security log entries are deleted after 90 days.
      </p>

      <h2>Your rights and choices</h2>
      <p>
        You can ask to access, correct, delete, or get a copy of your personal information by emailing {mail}. Depending on where you live
        (for example Maryland, California and other states with privacy laws), you may also have the right to opt out of the sale of your
        information or targeted advertising (we do neither), and to appeal if we refuse a request: reply to our decision with
        &ldquo;Appeal&rdquo; in the subject. We will respond within 45 days and won&apos;t treat you differently for using these rights. If your
        request is about an order you placed with a business, we may pass it to that business, which controls that information. You may use
        an authorized agent; we may need to verify your identity first.
      </p>

      <h2>Children</h2>
      <p>
        QueuedToGo is not directed to children under 13, and we do not knowingly collect their personal information. Account holders must be
        18 or older. If you believe a child has given us information, contact us and we will delete it.
      </p>

      <h2>Security</h2>
      <p>
        Information is sent over encrypted connections, access is limited to the people who need it, passwords are stored only as secure
        hashes, and each business&apos;s data is kept separate from every other&apos;s. No system is perfectly secure; if a breach affects your
        information, we will notify you and the authorities as the law requires.
      </p>

      <h2>Where information is processed</h2>
      <p>QueuedToGo is run from the United States and information is stored and processed in the United States.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy, we will update the date above. If a change is significant, we will tell account holders by email or in the
        app before it takes effect.
      </p>

      <h2>Contact</h2>
      <p>
        {operator}
        {address ? <>, {address}</> : null}. Email {mail}.
      </p>
    </LegalPage>
  );
}
