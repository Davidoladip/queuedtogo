import { connection } from "next/server";
import { notFound } from "next/navigation";
import { harnessEnabled } from "../../sample";
import { sampleGuests } from "../../rsvp/sample";
import { GuestSheet } from "@/components/guests/GuestSheet";

export default async function DevGuestPrint() {
  await connection();
  if (!harnessEnabled()) notFound();
  return <main className="page wrap"><GuestSheet title="Harbourfront Launch Party" eventDate="2026-11-07" business="Demo Business" guests={sampleGuests()} /></main>;
}
