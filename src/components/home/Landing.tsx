import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { LEGAL } from "@/lib/legal";
import { PASSES, PASS_ORDER, PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/plans";
import { SAMPLE_FORMS, type SampleKey } from "@/lib/demo";
import { FAQ } from "@/lib/faq";
import { HeroReel } from "./HeroReel";
import { HowItWorks } from "./HowItWorks";
import { PLATFORM_FEE_RATE } from "@/lib/payments";
import "./home.css";


/** The public homepage (signed-out visitors). */
const pct = (r: number) => `${+(r * 100).toFixed(1)}%`;
const feeRange = `${pct(Math.min(...Object.values(PLATFORM_FEE_RATE)))} to ${pct(Math.max(...Object.values(PLATFORM_FEE_RATE)))}`;

export function Landing() {
  return (
    <div className="hm">
      <a className="hm-skip" href="#main">Skip to content</a>
      <header className="hm-top">
        <div className="hm-in hm-top-in">
          <Logo />
          <nav aria-label="Main" className="hm-nav">
            <a href="#how">How it works</a>
            <a href="#tickets">Tickets</a>
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
        {/* Hero: the headline, and everything QueuedToGo does drifting past as illustrated cards */}
        <section className="hm-hero" aria-labelledby="hm-title">
          <div className="hm-in hm-hero-in">
            <div className="hm-hero-copy">
              <h1 id="hm-title">Live Event Forms, Ticketed Event Management, Personalized Digital Invitation And Live Guest Experience Platform</h1>
              <p className="hm-lede">
                Create a custom experience tailored to your event. Build a live activation form to collect guest orders, set up a
                ticketed event to manage ticket sales, or design a personalized digital invitation with RSVP tracking. Each
                experience is accessible via a QR code or direct link and includes real-time text notifications to keep guests
                informed.
              </p>
              <div className="hm-cta">
                <a href="#how" className="hm-btn">How it works</a>
                <a href="#pricing" className="hm-btn hm-btn-ghost">Free trial</a>
              </div>
            </div>

            <div className="hm-stage">
              <HeroReel />
            </div>
          </div>
        </section>

        <section id="how" className="hm-sec" aria-labelledby="hm-how">
          <div className="hm-in">
            <h2 id="hm-how" className="hm-h2">How it works</h2>
            <HowItWorks />
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

        <section id="tickets" className="hm-sec hm-tix" aria-labelledby="hm-tix-h">
          <div className="hm-in hm-tix-in">
            <div className="hm-tix-copy">
              <h2 id="hm-tix-h" className="hm-h2">Host paid events and sell tickets</h2>
              <p>
                Add tickets to any form: general admission, VIP, early bird, each with its own price and how many you have. Guests pay by
                card on their phone, and the money goes straight to your own Stripe or Square account.
              </p>
              <ul className="hm-ticks">
                <li>Ticket types with their own prices and limits</li>
                <li>Sold out and &ldquo;only a few left&rdquo; shown automatically, with an end date for sales</li>
                <li>Prices shown with all fees included, so there are no surprises at checkout</li>
                <li>Every ticket order gets a number, on your board and at the door</li>
              </ul>
              <div className="hm-cta" style={{ marginTop: 22 }}>
                <Link href="/signup" className="hm-btn">Start selling tickets</Link>
              </div>
              <p className="hm-tix-fine">
                QueuedToGo adds a small booking fee to each paid order, from {feeRange}, depending on your plan. You choose whether guests pay it or you do.
              </p>
            </div>
            <div className="hm-tix-art" role="img" aria-label="A ticket form for Friday Night Live: two general admission tickets at $25.50 each, VIP at $61.20 with 8 left, and a total of $51.00 including a $1.00 booking fee.">
              <div className="hm-tix-card" aria-hidden="true">
                <h3>Friday Night Live</h3>
                <p className="hm-tix-when">Sat, Dec 6 at The Warehouse</p>
                <div className="hm-tix-row"><b>General admission</b><span className="hm-tix-qty">2</span><small><span className="hm-tix-p">$25.50</span> each</small></div>
                <div className="hm-tix-row"><b>VIP, front row and a drink</b><span className="hm-tix-qty">0</span><small><span className="hm-tix-p">$61.20</span> each, 8 left</small></div>
                <div className="hm-tix-total"><span>Total</span><strong>$51.00</strong></div>
                <p className="hm-tix-feeline">Includes a $1.00 online booking fee</p>
                <span className="hm-tix-pay">Pay $51.00</span>
              </div>
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
            <p className="hm-sub">Start free. Paid plans include a {TRIAL_DAYS}-day free trial, come monthly or yearly with 2 months free, and you can change or cancel any time.</p>
            <div className="hm-plans">
              {PLAN_ORDER.map((k) => {
                const p = PLANS[k];
                return (
                  <article key={k} className={`hm-plan${k === "pro" ? " hm-plan-pick" : ""}`} aria-labelledby={`hm-p-${k}`}>
                    <h3 id={`hm-p-${k}`}>{p.name}</h3>
                    <p className="hm-price"><b>${p.price}</b> a month</p>
                    <p className="hm-annual">{p.annual ? `or $${p.annual.toLocaleString("en-US")} a year (2 months free)` : "No card needed"}</p>
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
            <Link href="/terms-of-service">Terms of Service</Link>
            <Link href="/terms">Texting terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
