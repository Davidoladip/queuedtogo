import Link from "next/link";
import type { FlyerSpec } from "@/lib/design/flyer";
import { Flyer } from "./Flyer";
import "./forms.css";

export type BoardCard = { id: string; title: string; slug: string; status: string; submitLabel: string; rsvp: boolean; spec: FlyerSpec; when: string; count: number; open: number };
export type StarterCard = { key: string; name: string; title: string; meta: string; button: string; spec: FlyerSpec };

const STATUS: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "good" }, closed: { label: "Closed", cls: "bad" }, draft: { label: "Draft", cls: "plain" },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The business's event forms as a board of flyers, each in its own design; or, with none yet, an invitation. */
export function FormsBoard({ orgSlug, cards, starters, base = `/w/${orgSlug}` }: { orgSlug: string; cards: BoardCard[]; starters: StarterCard[]; base?: string }) {
  if (!cards.length) {
    return (
      <section className="fempty" aria-labelledby="fempty-h">
        <div className="fempty-copy">
          <h2 id="fempty-h">Make your first event form</h2>
          <p>Pick a template for your kind of event. It comes with the right questions and its own look, and you can change everything.</p>
          <Link className="btn primary" href={`${base}/forms/new`}>Browse templates</Link>
        </div>
        <ul className="fempty-fan" aria-label="Example templates">
          {starters.map((s) => (
            <li key={s.key}>
              <Link href={`${base}/forms/new?template=${s.key}`}>
                <Flyer spec={s.spec} title={s.title} meta={s.meta || undefined} button={s.button} />
                <span className="sr-only">{s.name} template</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <ul className="fgrid" aria-label="Your event forms">
      {cards.map((c) => {
        const st = STATUS[c.status] ?? STATUS.draft;
        const edit = `${base}/forms/${c.id}`;
        return (
          <li key={c.id} className="fcard">
            <Link href={edit} className="fcard-art" tabIndex={-1} aria-hidden="true">
              <Flyer spec={c.spec} title={c.title} meta={c.when || undefined} button={c.submitLabel}>
                <span className={`pill ${st.cls} fly-badge`}>{st.label}</span>
              </Flyer>
            </Link>
            <div className="fcard-body">
              <h2 className="fcard-title"><Link href={edit}>{c.title}</Link></h2>
              <p className="fcard-when">{c.when || (c.status === "draft" ? "No date yet" : "")}<span className="sr-only">. Status: {st.label}</span></p>
              <p className="fcard-nums">
                {c.rsvp ? plural(c.count, "reply", "replies") : plural(c.count, "order")}
                {!c.rsvp && c.open > 0 && <>, {c.open} in production</>}
              </p>
              <div className="fcard-acts">
                <Link className="btn small primary" href={edit}>Edit</Link>
                {c.count > 0 && <Link className="btn small" href={c.rsvp ? `${base}/guests?form=${c.id}` : `${base}/submissions?form=${c.id}`}>{c.rsvp ? "Guests" : "Orders"}</Link>}
                {c.status === "live" && <a className="btn small ghost" href={`/f/${orgSlug}/${c.slug}`} target="_blank" rel="noopener noreferrer">Open form<span className="sr-only"> (opens in a new tab)</span></a>}
              </div>
            </div>
          </li>
        );
      })}
      <li className="fcard fcard-new">
        <Link href={`${base}/forms/new`} className="fnew">
          <span className="fnew-plus" aria-hidden="true" />
          <b>New event form</b>
          <span>Start from a template for markets, food trucks, concerts, weddings and more.</span>
        </Link>
      </li>
    </ul>
  );
}
