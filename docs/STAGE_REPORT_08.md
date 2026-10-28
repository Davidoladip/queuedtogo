# Stage report 8: RSVP mode

## What it does
- **Form type.** Settings → Form type: *An order form* or *An RSVP*. RSVP replies go to a new **Guests** page, never to the production board, and RSVP forms never ask for texting permission.
- **RSVP question** (Questions → "RSVP (yes / no / maybe)"). The answers always mean yes / no / maybe, with your own wording; leave Maybe empty to hide it. Optional guest count ("How many people, including you?", up to 20 per reply), hidden when a guest says no. One RSVP question per form.
- **Styling.** The answers are ordinary option buttons, so every Design setting applies: all option buttons, this question's options, or one answer alone (e.g. a green Yes), plus artwork per answer. The guest count box is its own styleable element. The thank-you screen and the guest's change page use the form's theme, title and button styles. Headlines for yes / maybe / no / waitlist and the thank-you message are editable, and each reply screen can be previewed in the builder.
- **Guest settings.** Start / end time, guest limit (counts people including plus-ones; maybes don't count), waitlist when full, reply-by date (end of that day in the business's time zone), "guests can change or cancel", reminder the day before.
- **Guests' side.** Thank-you screen with the event time and place, Add to Google Calendar and an .ics file (Apple / Outlook), and a private link (`/r/<token>`) to change or cancel. After the deadline guests can still cancel or bring fewer people.
- **Waitlist.** When a place frees up (a cancellation, fewer guests, or an owner removing a guest), the first waiting guest who fits gets it and an email. New replies never jump the waitlist.
- **Emails** (when email is on in Notifications and the guest gave an address): confirmation, "you're off the waitlist", and the day-before reminder (daily job at 14:17 UTC = 10:17 AM Eastern). Buttons use the form's accent colour.
- **Guests page.** Totals (coming against the limit, maybe, can't come, waitlist, checked in), search by name, email or last 4 phone digits, filters, door check-in mode (large, touch friendly, refreshes every 20 s), printable door list, CSV (owners and admins).

## Security
- New table `rsvps` with row level security: team members read their own business's guests and can change only `checked_in_at`; owners and admins can remove a guest; visitors have no access at all. Insert, truncate and other writes are revoked.
- `submit_rsvp`, `update_rsvp` and `queue_rsvp_reminders` run only with the server's service key. The guest's 64-character token is their only credential and is checked for shape before any lookup.
- Capacity checks lock the form row, so simultaneous replies can't overfill an event. One reply per email address per event (database index).
- The reminder job refuses requests without `Authorization: Bearer $CRON_SECRET` (compared in constant time). `CRON_SECRET` was added in Vercel for Production as a Sensitive variable.
- Finding outside this stage (not changed, needs your approval): Supabase's default grants give `anon` and `authenticated` the TRUNCATE privilege on the older tables. The REST API can't issue TRUNCATE, so it isn't reachable from the browser today, but revoking it is a sensible hardening step.

## Tests
- Database: 235 checks (53 new) including capacity, waitlist order and promotion, deadline rules, locked changes, reminders sent once, and isolation between businesses.
- Unit: 103 (19 new): settings, question rules, server checks, time zones and daylight saving, .ics escaping and folding, Google links, guest totals, CSV formula guard, emails, sending a queued RSVP email.
- Browser: `tests/e2e/rsvp.py` 72 checks (form, thank-you screens, change page, guest list, door mode on a phone, print, builder settings and styling). All earlier suites still pass (builder 71, customize 64, orders 20, board 51, notifications 43, event day 27, smoke 21).

## Not yet tested live
- A real RSVP on queuedtogo.com end to end (needs an RSVP form published by you), the confirmation email arriving, and the daily reminder job running on Vercel.
