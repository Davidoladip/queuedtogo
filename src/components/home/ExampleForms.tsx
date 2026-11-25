"use client";

import Link from "next/link";
import { useRef } from "react";
import { TEMPLATES, TEMPLATE_GROUPS } from "@/lib/templates";

const KIND: Record<string, string> = Object.fromEntries(TEMPLATE_GROUPS.map((g) => [g.key, g.title]));

/** One working sample form for each template, side by side in phone frames. Scroll sideways or use the arrows. */
export function ExampleForms() {
  const row = useRef<HTMLDivElement>(null);
  const move = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(".hm-ex-item");
    const step = card ? card.offsetWidth + 32 : 340;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="hm-ex-wrap">
      <div className="hm-ex-nav">
        <button type="button" className="hr-arrow" aria-label="Previous sample form" onClick={() => move(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="hr-arrow" aria-label="Next sample form" onClick={() => move(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="hm-ex-row" ref={row} role="region" aria-label="Sample forms" tabIndex={0}>
        {TEMPLATES.map((t) => (
          <figure key={t.key} className="hm-ex-item">
            <div className="hm-device">
              <iframe src={`/demo/template/${t.key}?frame=1`} title={`${t.name} sample form (working demo)`} loading="lazy" />
            </div>
            <figcaption>
              <small>{KIND[t.group]}</small>
              <span>{t.name}</span>
              <Link href={`/demo/template/${t.key}`}>Open full screen<span className="sr-only">: {t.name}</span></Link>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
