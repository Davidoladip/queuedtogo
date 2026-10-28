"use client";

import { GuestList, type GuestRow } from "@/components/guests/GuestList";

/** Development harness: the guest list with pretend check-in and remove. */
export function DemoGuests({ guests, door }: { guests: GuestRow[]; door: boolean }) {
  const wait = () => new Promise((r) => setTimeout(r, 100));
  return (
    <GuestList guests={guests} capacity={10} canManage timeZone="America/New_York" door={door}
      checkIn={async (id) => { await wait(); (window as unknown as { __checkins: string[] }).__checkins = [...((window as unknown as { __checkins?: string[] }).__checkins ?? []), id]; return { ok: true }; }}
      remove={async () => { await wait(); return { ok: false, error: "Only owners and admins can remove guests." }; }}
      exportHref="/dev/guests/export" printHref="/dev/guests/print" />
  );
}
