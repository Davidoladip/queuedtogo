import { PASSES } from "@/lib/plans";

/** Homepage questions; also published as FAQPage structured data, so the two can never disagree. */
export const FAQ: { q: string; a: string }[] = [
  { q: "Do my customers need to download an app?", a: "No. They scan the QR code at your table (or tap a link) and fill in the form in their phone's browser. Updates arrive as ordinary texts or emails." },
  { q: "What counts as a reply?", a: "Each order or RSVP someone sends you. The Free plan includes 50 a month and Starter 500; Pro and Events have no limit. Forms with an event pass have their own allowance." },
  { q: "Which plans include texts?", a: "Pro includes 1,000 texts a month and Events 3,000. Every plan can send email updates, with no limit. Customers only get texts if they tick the box agreeing to them, and they can reply STOP at any time." },
  { q: "Can I change plans or cancel?", a: "Yes, any time, from the Billing page. If you cancel, you keep your plan until the end of the period you've paid for, then move to Free. Your forms and orders stay put." },
  { q: "What's an event pass?", a: `A one-time payment for a single RSVP invitation, for hosts who don't need a monthly plan. It covers up to 100 guests ($${PASSES["100"].price}), 300 guests ($${PASSES["300"].price}) or unlimited guests ($${PASSES.unlimited.price}), and lasts until 30 days after your event.` },
  { q: "Can my team use it too?", a: "Yes. Invite people by email and choose what they can do. Owners and admins manage settings and billing; members work on orders. Starter includes 2 people, Pro 5 and Events 15." },
];
