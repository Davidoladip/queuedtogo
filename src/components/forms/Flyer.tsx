import type { CSSProperties, ReactNode } from "react";
import type { FlyerSpec } from "@/lib/design/flyer";
import "./flyer.css";

/**
 * A form drawn in miniature, in its own colours, texture, typeface and layout: what a customer will see, at a
 * glance. Purely visual (aria-hidden); the title and details are repeated as text next to it.
 */
export function Flyer({ spec, title, meta, button, children }: { spec: FlyerSpec; title: string; meta?: string; button: string; children?: ReactNode }) {
  const style = {
    "--fp": spec.page, "--fc": spec.card, "--ft": spec.text, "--fa": spec.accent, "--fat": spec.accentText,
    "--fr": `${spec.radius}px`, "--ftf": spec.titleFont, "--fbf": spec.bodyFont, "--ftc": spec.titleColor,
    "--fpt": spec.pageTex ?? "none", "--fpts": `${spec.pageTexSize}px`,
  } as CSSProperties;
  // Longer titles set smaller, so a whole title fits instead of being clipped (the longest word decides too).
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  const size = title.length > 34 || longest > 13 ? " xl" : title.length > 18 || longest > 9 ? " l" : "";
  return (
    <div className={`fly fly-${spec.layout}${spec.art ? " fly-has-art" : ""}`} style={style} aria-hidden="true">
      <div className="fly-page">
        {/* eslint-disable-next-line @next/next/no-img-element -- the form's own artwork, already sized for the web */}
        {spec.art && <img className="fly-art" src={spec.art} alt="" loading="lazy" decoding="async" />}
        {spec.layout === "side" && <span className="fly-side-mark" />}
        <div className="fly-card">
          {spec.envelope && <span className="fly-seal" style={{ background: spec.envelope.liner }} />}
          <b className={`fly-title${spec.titleUpper ? " up" : ""}${size}`}>{title}</b>
          {meta && <span className="fly-meta">{meta}</span>}
          <span className="fly-q fly-q-first" /><span className="fly-q short" />
          <span className="fly-btn">{button}</span>
        </div>
      </div>
      {children}
    </div>
  );
}
