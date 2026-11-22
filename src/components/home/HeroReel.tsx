"use client";

import { useState } from "react";

/** What QueuedToGo does, as illustrated cards: shared by the strip and its screen-reader text. */
const ITEMS: { title: string; text: string; art: React.ReactNode; tint: string }[] = [
  { title: "Take orders", text: "A QR-code order form for your stall or table", tint: "#E7F2EC", art: <ArtOrders /> },
  { title: "Sell tickets", text: "Paid events, paid straight to your Stripe or Square", tint: "#F1E6F5", art: <ArtTickets /> },
  { title: "Send invitations", text: "RSVPs in a sealed envelope guests tap to open", tint: "#F6EEDC", art: <ArtInvite /> },
  { title: "Track every order", text: "A production board from new to ready", tint: "#E6EAFB", art: <ArtBoard /> },
  { title: "Keep people posted", text: "Automatic texts and emails when it's ready", tint: "#E9EBF1", art: <ArtText /> },
  { title: "Run the day", text: "Pickup search, door check-in and end-of-day totals", tint: "#FFF4C9", art: <ArtDay /> },
];

/**
 * A slowly scrolling strip of what QueuedToGo does. It pauses while hovered, and has a Pause button (moving
 * content must be stoppable). With reduced motion it stands still and scrolls by hand. Screen readers get the
 * list once; the repeated copy that makes the loop seamless is hidden from them.
 */
export function HeroReel() {
  const [paused, setPaused] = useState(false);
  const card = (it: (typeof ITEMS)[number], k: number) => (
    <li key={k} className="hr-card">
      <div className="hr-art" style={{ background: it.tint }}>{it.art}</div>
      <b>{it.title}</b>
      <span>{it.text}</span>
    </li>
  );
  return (
    <div className={`hr${paused ? " hr-paused" : ""}`}>
      <div className="hr-head">
        <h2 id="hr-h" className="hr-title">Everything your event needs, in one place</h2>
        <button type="button" className="hr-toggle" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          <span className={`hr-icon ${paused ? "play" : "pause"}`} aria-hidden="true" />{paused ? "Play" : "Pause"}<span className="sr-only"> the scrolling list</span>
        </button>
      </div>
      <div className="hr-window">
        <div className="hr-track">
          <ul className="hr-list" aria-labelledby="hr-h">{ITEMS.map(card)}</ul>
          <ul className="hr-list hr-copy" aria-hidden="true">{ITEMS.map(card)}</ul>
        </div>
      </div>
    </div>
  );
}

function ArtOrders() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <path d="M58 104 L72 22 H128 L142 104 Z" fill="#fff" stroke="#161A2B" strokeWidth="2" strokeLinejoin="round" />
      <text x="100" y="38" textAnchor="middle" fontSize="9" fontWeight="700" fill="#036A3E">SCAN TO ORDER</text>
      <g transform="translate(78 46) scale(4)" fill="#161A2B"><path d="M0 0h1v1h-1z M1 0h1v1h-1z M2 0h1v1h-1z M4 0h1v1h-1z M5 0h1v1h-1z M8 0h1v1h-1z M9 0h1v1h-1z M10 0h1v1h-1z M0 1h1v1h-1z M1 1h1v1h-1z M2 1h1v1h-1z M4 1h1v1h-1z M6 1h1v1h-1z M8 1h1v1h-1z M9 1h1v1h-1z M10 1h1v1h-1z M0 2h1v1h-1z M1 2h1v1h-1z M2 2h1v1h-1z M4 2h1v1h-1z M6 2h1v1h-1z M8 2h1v1h-1z M9 2h1v1h-1z M10 2h1v1h-1z M4 3h1v1h-1z M5 3h1v1h-1z M6 3h1v1h-1z M0 4h1v1h-1z M2 4h1v1h-1z M3 4h1v1h-1z M7 4h1v1h-1z M9 4h1v1h-1z M0 5h1v1h-1z M1 5h1v1h-1z M2 5h1v1h-1z M3 5h1v1h-1z M5 5h1v1h-1z M8 5h1v1h-1z M10 5h1v1h-1z M0 6h1v1h-1z M1 6h1v1h-1z M3 6h1v1h-1z M4 6h1v1h-1z M6 6h1v1h-1z M7 6h1v1h-1z M10 6h1v1h-1z M8 7h1v1h-1z M10 7h1v1h-1z M0 8h1v1h-1z M1 8h1v1h-1z M2 8h1v1h-1z M4 8h1v1h-1z M6 8h1v1h-1z M8 8h1v1h-1z M0 9h1v1h-1z M1 9h1v1h-1z M2 9h1v1h-1z M6 9h1v1h-1z M10 9h1v1h-1z M0 10h1v1h-1z M1 10h1v1h-1z M2 10h1v1h-1z M6 10h1v1h-1z M8 10h1v1h-1z" /></g>
      <rect x="40" y="104" width="120" height="5" rx="2.5" fill="#161A2B" opacity=".18" />
    </svg>
  );
}

function ArtTickets() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <g transform="rotate(-6 100 60)">
        <path d="M30 34 h140 a8 8 0 0 0 0 16 v20 a8 8 0 0 0 0 16 H30 a8 8 0 0 0 0 -16 v-20 a8 8 0 0 0 0 -16 Z" fill="#2A1238" />
        <line x1="134" y1="38" x2="134" y2="82" stroke="#F2A93B" strokeWidth="2" strokeDasharray="3 4" />
        <text x="42" y="56" fontSize="8.5" fontWeight="700" letterSpacing=".04em" fill="#F2A93B">FRIDAY NIGHT LIVE</text>
        <text x="42" y="75" fontSize="17" fontWeight="800" fill="#FFF6E9">ADMIT 2</text>
        <text x="152" y="65" textAnchor="middle" fontSize="11" fontWeight="800" fill="#FFF6E9">$51</text>
      </g>
    </svg>
  );
}

function ArtInvite() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="44" y="26" width="112" height="72" rx="4" fill="#F1E8D4" stroke="#C9B48A" />
      <path d="M44 30 L100 66 L156 30" fill="#E7DABD" stroke="#C9B48A" />
      <path d="M44 98 L88 62 M156 98 L112 62" stroke="#C9B48A" fill="none" />
      <circle cx="100" cy="66" r="13" fill="#B8913A" />
      <circle cx="100" cy="66" r="9.5" fill="none" stroke="#8C6B22" strokeWidth="1.2" />
      <text x="100" y="69.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#5E4512">A&amp;D</text>
    </svg>
  );
}

function ArtBoard() {
  const col = (x: number, dot: string, n: number, hi = -1) => (
    <g>
      <rect x={x} y="20" width="44" height="82" rx="6" fill="#fff" opacity=".7" />
      <circle cx={x + 9} cy="30" r="3" fill={dot} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x + 5} y={40 + i * 20} width="34" height="15" rx="3" fill="#fff" stroke={i === hi ? "#1D8657" : "#D9DCE6"} strokeWidth={i === hi ? 2 : 1} />
          <rect x={x + 9} y={44 + i * 20} width="16" height="7" rx="1.5" fill="#FFD84D" />
        </g>
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      {col(28, "#8A90A6", 3)}{col(78, "#3346D3", 2, 1)}{col(128, "#1D8657", 1)}
      <path d="M118 75 q7 -6 12 -3" stroke="#1D8657" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M127 68 l5 4 l-6 2 Z" fill="#1D8657" />
    </svg>
  );
}

function ArtText() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="62" y="10" width="76" height="112" rx="12" fill="#161A2B" />
      <rect x="68" y="28" width="62" height="28" rx="8" fill="#2C3146" />
      <text x="73" y="39.5" fontSize="7" fill="#E9EBF1">Order QTG-1042</text>
      <text x="73" y="49.5" fontSize="7" fill="#E9EBF1">is ready now!</text>
      <rect x="84" y="62" width="44" height="16" rx="8" fill="#1D8657" />
      <text x="106" y="73" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">On my way</text>
      <circle cx="146" cy="30" r="10" fill="#FFD84D" />
      <text x="146" y="33.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="#161A2B">1</text>
    </svg>
  );
}

function ArtDay() {
  const row = (y: number, w: number, done: boolean) => (
    <g>
      <circle cx="58" cy={y} r="6" fill={done ? "#1D8657" : "#fff"} stroke={done ? "#1D8657" : "#C6C9D4"} strokeWidth="1.5" />
      {done && <path d={`M55 ${y} l2 2 l4 -4`} stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
      <rect x="70" y={y - 3.5} width={w} height="7" rx="3.5" fill="#161A2B" opacity={done ? 0.75 : 0.25} />
    </g>
  );
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <rect x="42" y="16" width="116" height="90" rx="10" fill="#fff" />
      {row(34, 58, true)}{row(52, 44, true)}{row(70, 52, false)}
      <line x1="52" y1="84" x2="148" y2="84" stroke="#E3E5EC" />
      <text x="54" y="98" fontSize="8" fill="#5A6077">Today</text>
      <text x="146" y="98" textAnchor="end" fontSize="11" fontWeight="800" fill="#161A2B">$1,284</text>
    </svg>
  );
}
