"use client";

import { useRef, useState, type KeyboardEvent } from "react";

type Flow = { key: string; tab: string; lede: string; steps: { title: string; text: string }[] };

/** The three experiences QueuedToGo runs, each in three steps. Copy describes only what the product does today. */
const FLOWS: Flow[] = [
  {
    key: "forms",
    tab: "Live event forms",
    lede: "For pop-ups, markets, food stands and live personalisation: guests order from their phone, and you make and hand over every order without a queue.",
    steps: [
      { title: "Build your order form", text: "Start from a template, then add your items, sizes, colours, photos and names to personalise. Match it to your brand with your colours, fonts and artwork." },
      { title: "Guests order from their phone", text: "Put the QR code on your table or share the link. Guests choose what they want and order in a minute, and can pay online if you sell items." },
      { title: "Make it and hand it over", text: "Every order becomes a numbered job on your production board. Move it from new to making to ready; the guest gets a text, and you find their order at pickup in seconds." },
    ],
  },
  {
    key: "tickets",
    tab: "Ticketed events",
    lede: "For concerts, classes, workshops and galas: sell tickets online and get paid straight to your own account.",
    steps: [
      { title: "Set up your tickets", text: "Add ticket types such as general admission, VIP or early bird, each with its own price and quantity. Set when sales end and how many one person can buy." },
      { title: "Guests buy on their phone", text: "Prices are shown with all fees included. Guests pay by card through your Stripe or Square account, and tickets show as sold out automatically when they're gone." },
      { title: "Welcome them at the door", text: "Every ticket order has a number. On the day, look anyone up by number, name or phone, and see every order in one place." },
    ],
  },
  {
    key: "invites",
    tab: "Digital invitations",
    lede: "For weddings, birthdays, showers and community events: a personalised invitation guests love to open, with every reply tracked for you.",
    steps: [
      { title: "Design your invitation", text: "Choose a sealed envelope that opens when tapped, a cover page, and your own colours, fonts, paper and seal. Add the date, time and place." },
      { title: "Guests RSVP in seconds", text: "They reply yes, no or maybe and answer your questions, such as a meal choice. Set a reply-by date and a guest limit, with a waitlist when you're full." },
      { title: "Know who's coming", text: "Watch replies arrive on your live guest list. Send a reminder text the day before, print the list, and check guests in at the door." },
    ],
  },
];

/** What every experience includes. */
const INCLUDED: { title: string; text: string }[] = [
  { title: "A QR code and a link", text: "Print it, post it or text it: guests open your form on any phone, no app needed." },
  { title: "Real-time texts and emails", text: "Guests are told when orders are ready, tickets are confirmed or RSVPs change." },
  { title: "Templates and full design", text: "Ready-made looks for every kind of event, and every colour, font and layout yours to change." },
  { title: "Your team, with roles", text: "Invite helpers as owners, admins or members, each seeing what they need." },
  { title: "Event-day tools", text: "A pickup screen, a daily summary, printed order tickets and labels, and a spreadsheet of every order." },
];

/**
 * How it works: a one-paragraph summary of the platform, the three experiences as tabs (three steps each), and
 * what every experience includes. Tabs follow the WAI-ARIA pattern: arrow keys, Home and End move between them.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = FLOWS.length;
    const next = e.key === "ArrowRight" ? (active + 1) % n : e.key === "ArrowLeft" ? (active - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <div className="hw">
      <p className="hm-sub hw-sum">
        QueuedToGo gives every event its own experience, opened from a QR code or a link: an order form for selling at live events, a
        ticketed event for paid admission, or a personalised digital invitation with RSVPs. Behind each one you get a live view of every
        order, ticket and guest, and automatic text updates that keep guests informed. Pick an experience to see how it works.
      </p>
      <div className="hw-tabs" role="tablist" aria-label="Experiences">
        {FLOWS.map((f, i) => (
          <button key={f.key} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`hw-tab-${f.key}`} aria-controls={`hw-panel-${f.key}`}
            aria-selected={active === i} tabIndex={active === i ? 0 : -1} className="hw-tab" onClick={() => setActive(i)} onKeyDown={onKey}>
            {f.tab}
          </button>
        ))}
      </div>
      {FLOWS.map((f, i) => (
        <div key={f.key} role="tabpanel" id={`hw-panel-${f.key}`} aria-labelledby={`hw-tab-${f.key}`} hidden={active !== i} className="hw-panel" tabIndex={0}>
          <p className="hw-lede">{f.lede}</p>
          <ol className="hm-steps">
            {f.steps.map((s, k) => (
              <li key={s.title}>
                <span className="hm-step-n" aria-hidden="true">{k + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div className="hw-inc">
        <h3 className="hw-inc-h">Included with every experience</h3>
        <ul className="hw-inc-list">
          {INCLUDED.map((it) => <li key={it.title}><b>{it.title}</b><span>{it.text}</span></li>)}
        </ul>
      </div>
    </div>
  );
}
