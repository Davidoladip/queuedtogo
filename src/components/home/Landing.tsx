import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LEGAL } from "@/lib/legal";
import { PASSES, PASS_ORDER, PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/plans";
import { SAMPLE_FORMS, type SampleKey } from "@/lib/demo";
import "./home.css";

const FAQ: { q: string; a: string }[] = [
  { q: "Do my customers need to download an app?", a: "No. They scan the QR code at your table (or tap a link) and fill in the form in their phone's browser. Updates arrive as ordinary texts or emails." },
  { q: "What counts as a reply?", a: "Each order or RSVP someone sends you. The Free plan includes 50 a month and Starter 500; Pro and Events have no limit. Forms with an event pass have their own allowance." },
  { q: "Which plans include texts?", a: "Pro includes 1,000 texts a month and Events 3,000. Every plan can send email updates, with no limit. Customers only get texts if they tick the box agreeing to them, and they can reply STOP at any time." },
  { q: "Can I change plans or cancel?", a: "Yes, any time, from the Billing page. If you cancel, you keep your plan until the end of the period you've paid for, then move to Free. Your forms and orders stay put." },
  { q: "What's an event pass?", a: `A one-time payment for a single RSVP invitation, for hosts who don't need a monthly plan. It covers up to 100 guests ($${PASSES["100"].price}), 300 guests ($${PASSES["300"].price}) or unlimited guests ($${PASSES.unlimited.price}), and lasts until 30 days after your event.` },
  { q: "Can my team use it too?", a: "Yes. Invite people by email and choose what they can do. Owners and admins manage settings and billing; members work on orders. Starter includes 2 people, Pro 5 and Events 15." },
];

/** The public homepage (signed-out visitors). */
export function Landing() {
  return (
    <div className="hm">
      <a className="hm-skip" href="#main">Skip to content</a>
      <header className="hm-top">
        <div className="hm-in hm-top-in">
          <Logo />
          <nav aria-label="Main" className="hm-nav">
            <a href="#how">How it works</a>
            <a href="#invitations">Invitations</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="hm-top-act">
            <Link href="/login" className="hm-link">Sign in</Link>
            <Link href="/signup" className="hm-btn hm-btn-sm">Start free</Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero: the product doing its one job, an order moving to ready and the customer being told */}
        <section className="hm-hero" aria-labelledby="hm-title">
          <div className="hm-in hm-hero-in">
            <div className="hm-hero-copy">
              <h1 id="hm-title">Take orders at your event. Text customers when they&apos;re ready.</h1>
              <p className="hm-lede">
                QueuedToGo gives your stand a QR-code order form, a board to work through every order, and automatic
                updates, so customers keep shopping instead of standing in line.
              </p>
              <div className="hm-cta">
                <Link href="/signup" className="hm-btn">Start free</Link>
                <a href="#examples" className="hm-btn hm-btn-ghost">See real event forms</a>
              </div>
              <p className="hm-fine">Free plan, no card needed. Paid plans from ${PLANS.starter.price} a month.</p>
            </div>

            <div className="hm-stage" role="img" aria-label="An order, QTG-1042 for a tote bag, moves from New to Making to Ready, and the customer gets a text saying it's ready to pick up.">
              <div className="hm-board" aria-hidden="true">
                <div className="hm-col"><span className="hm-col-h"><i style={{ background: "#8A90A6" }} />New</span>
                  <div className="hm-tk"><b>QTG-1043</b><span>Toiletry bag, red</span></div>
                </div>
                <div className="hm-col"><span className="hm-col-h"><i style={{ background: "#3346D3" }} />Making</span>
                  <div className="hm-tk"><b>QTG-1039</b><span>Tote bag × 2</span></div>
                </div>
                <div className="hm-col"><span className="hm-col-h"><i style={{ background: "#1D8657" }} />Ready</span>
                  <div className="hm-tk hm-tk-done"><b>QTG-1037</b><span>Toiletry bag, blue</span></div>
                </div>
                <div className="hm-tk hm-mover"><b>QTG-1042</b><em>Lena O.</em><span>Tote bag, gold thread</span></div>
              </div>
              <div className="hm-phone" aria-hidden="true">
                <div className="hm-phone-top">ThreadToGo</div>
                <div className="hm-sms hm-sms-1">Thanks Lena! Order QTG-1042 is in. We&apos;ll text you when it&apos;s ready.</div>
                <div className="hm-sms hm-sms-2">Your order QTG-1042 is ready to pick up at our table. queuedtogo.com/t/…</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="hm-sec" aria-labelledby="hm-how">
          <div className="hm-in">
            <h2 id="hm-how" className="hm-h2">How it works</h2>
            <ol className="hm-steps">
              <li>
                <span className="hm-step-n" aria-hidden="true">1</span>
                <h3>Customers order from their phone</h3>
                <p>Print the QR code for your table or share the link. They pick the item, size, colour and name, and they&apos;re done in a minute.</p>
              </li>
              <li>
                <span className="hm-step-n" aria-hidden="true">2</span>
                <h3>Every order lands on your board</h3>
                <p>Each one gets a number and a card. Move it from new to making to ready, assign it to a teammate, and see what&apos;s due first.</p>
              </li>
              <li>
                <span className="hm-step-n" aria-hidden="true">3</span>
                <h3>They hear from you automatically</h3>
                <p>When an order reaches the stages you choose, the customer gets a text or email with a link to track it. No calling out names.</p>
              </li>
            </ol>
          </div>
        </section>

        <section id="examples" className="hm-sec hm-ex" aria-labelledby="hm-ex">
          <div className="hm-in">
            <h2 id="hm-ex" className="hm-h2">Forms from real events</h2>
            <p className="hm-sub">Two order forms ThreadToGo used at live events. They&apos;re working copies: scroll them, fill them in, and see what your customers would see. Nothing you type is saved.</p>
            <div className="hm-ex-row">
              {(Object.keys(SAMPLE_FORMS) as SampleKey[]).map((k) => (
                <figure key={k} className="hm-ex-item">
                  <div className="hm-device">
                    <iframe src={`/demo${k === "style-and-sip" ? "" : "/" + k}?frame=1`} title={`${SAMPLE_FORMS[k].caption} (working demo)`} loading="lazy" />
                  </div>
                  <figcaption>
                    <span>{SAMPLE_FORMS[k].caption}</span>
                    <Link href={k === "style-and-sip" ? "/demo" : `/demo/${k}`}>Open full screen</Link>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="hm-sec hm-feats" aria-label="Features">
          <div className="hm-in">
            <div className="hm-feat">
              <div className="hm-feat-copy">
                <h2 className="hm-h2">A form that looks like your brand</h2>
                <p>Build it in minutes: questions, sizes, colour swatches, photos of your items, multiple pages. Pick a look or set your own colours, fonts and artwork. What you see is exactly what customers get.</p>
                <ul className="hm-ticks">
                  <li>Quantity per size, swatches and file uploads for logos</li>
                  <li>Live preview on desktop and phone</li>
                  <li>One link and QR code per event</li>
                </ul>
              </div>
              <figure className="hm-shot"><Image src="/home/builder.webp" alt="The form builder: questions on the left and a live preview of the Harbourfront Food Fest order form on the right." width={1232} height={760} sizes="(max-width: 900px) 100vw, 640px" /></figure>
            </div>
            <div className="hm-feat hm-feat-flip">
              <div className="hm-feat-copy">
                <h2 className="hm-h2">Make orders in the right order</h2>
                <p>Your production board shows every order as a card in columns you name yourself, like artwork approval or quality check. Overdue and urgent orders stand out, and nothing gets lost in a notebook.</p>
                <ul className="hm-ticks">
                  <li>Your own stages, with a message for each</li>
                  <li>Due dates, priorities and who&apos;s on it</li>
                  <li>Full history of every order</li>
                </ul>
              </div>
              <figure className="hm-shot hm-shot-wide"><Image src="/home/board.webp" alt="The production board: totals for open, due-today and overdue jobs above order cards in New order, Artwork approval and In production columns." width={980} height={560} sizes="(max-width: 900px) 100vw, 640px" /></figure>
            </div>
            <div className="hm-feat">
              <div className="hm-feat-copy">
                <h2 className="hm-h2">Hand orders over fast on the day</h2>
                <p>Find any order by number, name or the last four digits of a phone, and mark it collected in one tap. Print order tickets, and see the day&apos;s totals when you pack up.</p>
                <ul className="hm-ticks">
                  <li>Pickup search built for a busy table</li>
                  <li>Printable tickets and end-of-day summary</li>
                  <li>Works on a phone or tablet</li>
                </ul>
              </div>
              <figure className="hm-shot hm-shot-wide"><Image src="/home/pickup.webp" alt="The pickup screen: a search for 100 lists orders QTG-1001 to QTG-1003, each with a Mark collected button." width={980} height={470} sizes="(max-width: 900px) 100vw, 640px" /></figure>
            </div>
          </div>
        </section>

        <section id="invitations" className="hm-inv" aria-labelledby="hm-inv-h">
          <div className="hm-in hm-inv-in">
            <div className="hm-inv-copy">
              <h2 id="hm-inv-h">Hosting an event? Send an invitation they&apos;ll want to open.</h2>
              <p>
                Switch any form to RSVP and guests reply yes, no or maybe, with how many they&apos;re bringing. Add a cover
                page, or a sealed envelope that opens to reveal the invitation.
              </p>
              <ul className="hm-inv-list">
                <li>Guest numbers, plus-ones, capacity and a waitlist</li>
                <li>Confirmation and reminder emails with calendar links</li>
                <li>Guest list, printable sheet and door check-in</li>
                <li>Guests can change their reply from their own link</li>
              </ul>
              <div className="hm-cta">
                <Link href="/demo/invitation" className="hm-btn hm-btn-gold">Open the demo invitation</Link>
              </div>
              <p className="hm-inv-pass">
                Just one event? Buy an event pass instead of a plan: {PASS_ORDER.map((t) => `$${PASSES[t].price} for ${PASSES[t].guestLimit === null ? "unlimited guests" : `up to ${PASSES[t].guestLimit} guests`}`).join(", ")}.
              </p>
            </div>
            <div className="hm-inv-art">
              <Image className="hm-inv-env" src="/home/envelope.webp" alt="A sealed ivory envelope with a gold seal." width={558} height={372} sizes="(max-width: 900px) 70vw, 420px" />
              <Image className="hm-inv-card" src="/home/invite_open.webp" alt="The opened invitation: “You're invited!” in gold script with an Accept your invitation button." width={616} height={423} sizes="(max-width: 900px) 80vw, 460px" />
            </div>
          </div>
        </section>

        <section id="pricing" className="hm-sec" aria-labelledby="hm-price">
          <div className="hm-in">
            <h2 id="hm-price" className="hm-h2">Pricing</h2>
            <p className="hm-sub">Start free. Paid plans include a {TRIAL_DAYS}-day free trial, and you can change or cancel any time.</p>
            <div className="hm-plans">
              {PLAN_ORDER.map((k) => {
                const p = PLANS[k];
                return (
                  <article key={k} className={`hm-plan${k === "pro" ? " hm-plan-pick" : ""}`} aria-labelledby={`hm-p-${k}`}>
                    <h3 id={`hm-p-${k}`}>{p.name}</h3>
                    <p className="hm-price"><b>${p.price}</b> a month</p>
                    <p className="hm-plan-blurb">{p.blurb}</p>
                    <ul className="hm-ticks">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                    <Link href="/signup" className={`hm-btn hm-btn-block${k === "pro" ? "" : " hm-btn-ghost"}`}>
                      {k === "free" ? "Start free" : `Try ${p.name} free for ${TRIAL_DAYS} days`}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="hm-sub hm-pass-line">
              Hosting a single event? An event invitation pass is a one-time payment: {PASS_ORDER.map((t) => `$${PASSES[t].price} for ${PASSES[t].name.toLowerCase()}`).join(", ")}.
            </p>
          </div>
        </section>

        <section className="hm-sec hm-faq" aria-labelledby="hm-faq">
          <div className="hm-in hm-faq-in">
            <h2 id="hm-faq" className="hm-h2">Questions</h2>
            <div>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="hm-end" aria-labelledby="hm-end">
          <div className="hm-in hm-end-in">
            <div>
              <h2 id="hm-end">Set up your next event tonight.</h2>
              <p>Make your form, print the QR code, and take your first order. It&apos;s free to start.</p>
            </div>
            <div className="hm-cta">
              <Link href="/signup" className="hm-btn hm-btn-yellow">Start free</Link>
              <Link href="/demo" className="hm-btn hm-btn-line">Try the demo</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="hm-foot">
        <div className="hm-in hm-foot-in">
          <div>
            <Logo />
            <p>Made by {LEGAL.operator} in {LEGAL.address}.</p>
          </div>
          <nav aria-label="Footer">
            <Link href="/demo">Demo</Link>
            <a href="#pricing">Pricing</a>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
