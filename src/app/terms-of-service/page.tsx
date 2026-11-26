import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LEGAL, legalReady } from "@/lib/legal";
import { LegalPage } from "@/components/legal/LegalPage";
import { PLATFORM_FEE_RATE } from "@/lib/payments";
import { PASSES, PASS_ORDER, PLANS, PLAN_ORDER } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The agreement between QueuedToGo (ThreadToGo LLC) and the businesses and hosts who use it: plans and billing, payments, acceptable use, content, liability and disputes.",
  alternates: { canonical: "/terms-of-service" },
};

const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

export default function TermsOfServicePage() {
  if (!legalReady()) notFound();
  const { operator, contactEmail, address, tosUpdated } = LEGAL;
  const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;
  return (
    <LegalPage title="Terms of Service" updated={tosUpdated}>
      <p>
        These Terms of Service (the &ldquo;Terms&rdquo;) are an agreement between you and {operator} (&ldquo;QueuedToGo&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;), the company that runs QueuedToGo. They apply when you create an account, set up a business, or
        otherwise use QueuedToGo to take orders, sell tickets, send invitations or keep customers updated. If you use QueuedToGo for a
        company or other organization, you agree to these Terms for it and confirm you are allowed to.
      </p>
      <p>
        <b>Please read section 16. It requires most disputes to be resolved by individual arbitration, not in court, and waives class actions.
        You can opt out of arbitration within 30 days.</b>
      </p>
      <p>
        People who only place an order or RSVP on a business&apos;s form don&apos;t need an account. Their purchase is with that business (see
        section 6), our <Link href="/privacy">privacy policy</Link> explains how we handle their information, and our{" "}
        <Link href="/terms">texting terms</Link> cover order update texts.
      </p>

      <h2>1. Who can use QueuedToGo</h2>
      <p>
        You must be at least 18 and able to enter into a binding contract. QueuedToGo is a tool for businesses, organizations and event hosts;
        it is not directed to children, and you may not use it to collect information from children under 13.
      </p>

      <h2>2. Your account</h2>
      <p>
        Keep your sign-in details secure and tell us at {mail} straight away if you think someone else has used your account. You are
        responsible for what happens in your account and for the people you invite to your business, and for making sure the information you
        give us is accurate.
      </p>

      <h2>3. Plans, event passes and automatic renewal</h2>
      <ul>
        <li>
          <b>Plans.</b> The plans, their prices and what each includes are shown on our <Link href="/#pricing">pricing</Link> and Billing pages.
          Today they are {PLAN_ORDER.map((k) => `${PLANS[k].name} ($${PLANS[k].price} a month${PLANS[k].annual ? ` or $${PLANS[k].annual.toLocaleString("en-US")} a year` : ""})`).join(", ")}.
          Prices exclude any sales tax, which is added where it applies.
        </li>
        <li>
          <b>Building is free; publishing needs a plan or a pass.</b> You can create an account, build forms and test them without paying.
          To publish a form so guests can use it, your business needs a paid plan or an event pass for that form. There is no free trial:
          a paid plan is charged when you start it. Businesses created before November 26, 2026 keep the Free plan they had.
        </li>
        <li>
          <b>Automatic renewal.</b> <b>Paid plans renew automatically at the end of each billing period (monthly or yearly, as you chose) and
          your card is charged the plan price at the start of each new period until you cancel.</b>
        </li>
        <li>
          <b>Cancelling.</b> You can cancel online at any time from Billing &rsaquo; Manage billing, or by emailing {mail}. Cancelling stops
          future charges; you keep the plan until the end of the period you have paid for. After that, a business that had the Free plan
          returns to it; any other business keeps its forms and orders, but forms without an event pass stop taking new replies until a plan
          is chosen again.
        </li>
        <li>
          <b>Refunds.</b> Except where the law requires otherwise, payments for a billing period that has started are not refunded, including for
          the unused part of a period. If you believe you were charged in error, email us within 60 days and we will make it right.
        </li>
        <li>
          <b>Price changes.</b> We will tell you by email at least 30 days before a price change applies to you. It takes effect at your next
          renewal after that, and you can cancel before then.
        </li>
        <li>
          <b>Event passes</b> are one-time payments for one form of any kind (orders, tickets or RSVPs). Today they are{" "}
          {PASS_ORDER.map((t) => `$${PASSES[t].price} for ${PASSES[t].name.toLowerCase()} (with ${PASSES[t].texts.toLocaleString("en-US")} text messages)`).join(", ")}.
          A pass lasts until 30 days after the event date (or 120 days after purchase if the form has no date). Passes do not renew and are
          not charged again. If you bought a pass by mistake and the form has not received any replies, email us within 14 days for a refund.
        </li>
        <li>
          <b>Failed payments.</b> If a renewal payment fails, the payment will be tried again. If it keeps failing, the plan ends as if
          you had cancelled.
        </li>
      </ul>

      <h2>4. Taking payments from your customers</h2>
      <p>
        You can connect your own Stripe or Square account to sell items and tickets on your forms. When you do:
      </p>
      <ul>
        <li>
          <b>You are the seller.</b> Payments are made directly to your Stripe or Square account, in your name. You are the merchant of record and
          are responsible for what you sell: fulfilling orders, honouring the refund policy you choose on each form, handling questions,
          refunds, chargebacks and disputes, and any sales tax or other taxes on your sales. Your use of Stripe or Square is also governed by
          their terms.
        </li>
        <li>
          <b>Booking fee.</b> We charge a booking fee on each paid order: {PLAN_ORDER.map((k) => `${pct(PLATFORM_FEE_RATE[k])} on ${PLANS[k].name}`).join(", ")}.
          You choose on each form whether the buyer pays it (it is then included in every price shown to them and itemized at checkout) or
          you do (it is taken from your share). Card processing fees are charged separately by Stripe or Square.
        </li>
        <li>
          <b>Accurate prices.</b> You must show the prices and terms you actually intend to charge, and you may not add charges outside
          QueuedToGo that buyers were not shown. If you sell tickets you are responsible for following the laws that apply to ticket sales and
          to your event.
        </li>
        <li>
          <b>Refunds you owe.</b> If a buyer pays after their tickets have sold out or their hold has expired, we refund them automatically.
          If a payment is reversed or refunded, the booking fee may be reversed as well.
        </li>
      </ul>

      <h2>5. Texts and emails to your customers</h2>
      <p>
        QueuedToGo sends order and RSVP updates on your behalf. Texts go only to people who tick the consent box on your form, and stop when
        they reply STOP or otherwise ask to stop. You agree to use these messages only for updates about the customer&apos;s own order or RSVP,
        never for marketing, and not to add phone numbers or consent that the customer did not give through the form.
      </p>

      <h2>6. Your customers and their information</h2>
      <p>
        Orders, payments and RSVPs are between you and your customer; QueuedToGo is not a party to them. For the information your customers
        give on your forms, you decide what to collect and how it is used, and we process it on your behalf to provide QueuedToGo, as described
        in our <Link href="/privacy">privacy policy</Link>. You are responsible for having the right to collect it, for not collecting more
        than you need, for not asking for sensitive information such as full card numbers, Social Security numbers or health details, and
        for responding to your customers&apos; requests about their information (we will help).
      </p>

      <h2>7. Acceptable use</h2>
      <p>You may not use QueuedToGo to:</p>
      <ul>
        <li>break any law or anyone else&apos;s rights, including consumer protection, privacy, anti-spam and ticket sales laws;</li>
        <li>sell anything illegal, counterfeit, stolen or dangerous, or sell tickets you are not entitled to sell;</li>
        <li>impersonate anyone, mislead buyers, or collect passwords, card details or other information under false pretences;</li>
        <li>post content that is unlawful, infringing, hateful, harassing, sexually explicit, or that exploits minors;</li>
        <li>send spam or marketing texts, or text anyone who has not agreed;</li>
        <li>upload malware, probe or attack the service, get around its limits, or access other businesses&apos; data; or</li>
        <li>resell or copy QueuedToGo, or use it to build a competing product.</li>
      </ul>

      <h2>8. Your content</h2>
      <p>
        You keep ownership of everything you put into QueuedToGo, such as your forms, artwork, logos and photos. You give us permission to
        host, copy, display and process it only as needed to run QueuedToGo for you, for example showing your published form to your
        customers and showing your images in previews. You confirm you have the rights to everything you upload. If you share ideas or
        feedback with us, we may use them without owing you anything.
      </p>

      <h2>9. Copyright complaints</h2>
      <p>
        If you believe content on QueuedToGo infringes your copyright, send a notice to our designated agent at {mail} (subject
        &ldquo;Copyright notice&rdquo;), or by post to {operator}{address ? `, ${address}` : ""}, including: your contact details; the work you
        believe is infringed; the link to the content; a statement that you have a good-faith belief the use is not authorized; a statement,
        under penalty of perjury, that your notice is accurate and that you are the owner or authorized to act for them; and your physical or
        electronic signature. We will remove or disable access to infringing content and may close the accounts of repeat infringers. If
        your content was removed and you believe that was a mistake, you can send us a counter-notice.
      </p>

      <h2>10. Our service</h2>
      <p>
        QueuedToGo, including its software, design and brand, belongs to us and our licensors. We may improve, change or stop features; if we
        stop something material you are paying for, we will tell you in advance and refund any prepaid fees for the part you can no longer
        use. We rely on other providers (such as hosting, database, payments and messaging providers) and are not responsible for their
        outages, although we work to keep QueuedToGo available.
      </p>

      <h2>11. Suspension and closing your account</h2>
      <p>
        You can stop using QueuedToGo and delete your business at any time in Settings. We may suspend or close an account that breaks these
        Terms, puts others at risk, or that the law requires us to act on. Where reasonable we will tell you first and give you a chance to
        fix the problem. When an account is closed we delete its data within a reasonable time, except what we must keep by law.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        QueuedToGo is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent the law allows, we disclaim all
        warranties, express or implied, including merchantability, fitness for a particular purpose and non-infringement. We don&apos;t promise
        that QueuedToGo will be uninterrupted or error-free, or that every text or email will be delivered (carriers and inboxes can delay or
        block messages).
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, neither you nor we will be liable for indirect, incidental, special, consequential or punitive
        damages, or for lost profits, revenue or data, even if warned they were possible. Our total liability for all claims relating to
        QueuedToGo is limited to the greater of the amount you paid us in the 12 months before the claim arose and $100. These limits do not
        apply to liability that cannot be limited by law, such as for fraud or wilful misconduct.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You will defend and compensate us for claims, losses and costs (including reasonable legal fees) brought by others that arise from
        your products, tickets, events or sales, your content, your dealings with your customers, or your breach of these Terms or the law.
      </p>

      <h2>15. Changes to these Terms</h2>
      <p>
        We may update these Terms. If a change is material we will tell you by email or in QueuedToGo at least 30 days before it takes effect
        (sooner only if the law requires it), and ask you to accept it. If you don&apos;t agree, you can cancel before it takes effect.
      </p>

      <h2>16. Resolving disputes: arbitration and class action waiver</h2>
      <ul>
        <li>
          <b>Talk to us first.</b> Before starting any claim, email {mail} with a description of the problem and what you want. Both sides will
          try in good faith to resolve it within 60 days.
        </li>
        <li>
          <b>Arbitration.</b> If it isn&apos;t resolved, any dispute between you and us relating to QueuedToGo or these Terms will be decided by
          binding individual arbitration administered by the American Arbitration Association under its applicable rules, rather than in
          court. The arbitration may be held by video or in Anne Arundel County, Maryland, or in another place you and we agree. The Federal
          Arbitration Act governs this section.
        </li>
        <li>
          <b>Exceptions.</b> Either side may bring an individual claim in small claims court, or ask a court to stop infringement or misuse of
          intellectual property or of the service.
        </li>
        <li>
          <b>No class actions.</b> Claims may be brought only individually, not as a plaintiff or class member in any class, collective or
          representative proceeding, and an arbitrator may not combine claims of different people. If this waiver is found unenforceable for a
          claim, that claim will go to court, not to arbitration.
        </li>
        <li>
          <b>Opting out.</b> You can opt out of this arbitration agreement by emailing {mail} within 30 days of first accepting these Terms,
          with your name, your business and a statement that you opt out of arbitration.
        </li>
      </ul>

      <h2>17. General</h2>
      <p>
        These Terms are governed by the laws of the State of Maryland and applicable US federal law, without regard to conflict-of-law rules.
        Any court proceeding allowed under section 16 will be in the state or federal courts located in Maryland, and both sides consent to
        their jurisdiction. If part of these Terms is unenforceable, the rest still applies. Our not enforcing a term is not a waiver. You may
        not transfer these Terms without our consent; we may transfer them to a successor to our business. These Terms, together with the
        policies they link to, are the whole agreement between you and us about QueuedToGo.
      </p>

      <h2>Contact</h2>
      <p>
        {operator}
        {address ? <>, {address}</> : null}. Email {mail}.
      </p>
    </LegalPage>
  );
}
