# Stage report 8: RSVP mode

## What it does
- **Form type.** Settings → Form type: *An order form* or *An RSVP*. RSVP replies go to a new **Guests** page, never to the production board, and RSVP forms never ask for texting permission.
- **RSVP question** (Questions → "RSVP (yes / no / maybe)"). The answers always mean yes / no / maybe, with your own wording; leave Maybe empty to hide it. Optional guest count ("How many people, including you?", up to 20 per reply), hidden when a guest says no. One RSVP question per form.
- **Styling.** The answers are ordinary option buttons, so every Design setting applies: all option buttons, this question's options, or one answer alone (e.g. a green Yes), plus artwork per answer. The guest count box is its own styleable element. The thank-you screen and the guest's change page use the form's theme, title and button styles. Headlines for yes / maybe / no / waitlist and the thank-you message are editable, and each reply screen can be previewed in the builder.
- **Guest settings.** Start / end time, guest limit (counts people including plus-ones; maybes don't count), waitlist when full, reply-by date (end of that day in the business's time zone), "guests can change or cancel", reminder the day before.
- **Guests' side.** Thank-you screen with the event time and place, Add to Google Calendar and an .ics file (Apple / Outlook), and a private link (`/r/<token>`) to change or cancel. After the deadline guests can still cancel or bring fewer people.
- **Waitlist.** When a place frees up (a cancellation, fewer guests, or an owner removing a guest), the first waiting guest who fits gets it and an email. New replies never jump the waitlist.
- **Emails** (when email is on in Notifications and the guest gave an address): confirmation, "you're off the waitlist", and the day-before reminder (daily job at 18:17 UTC = 2:17 PM Eastern). Buttons use the form's accent colour.
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

## Update: texts for RSVP forms
- Settings → *Guest emails and texts* → **Offer texts to guests**. This adds an unticked permission checkbox (editable wording, default mentions STOP/HELP and "up to 4 msgs") and, if the form has none, an optional *Mobile number* question.
- Guests who tick the box **and** give a mobile number get their confirmation, the day-before reminder and "you're off the waitlist" by text (in addition to email). Permission is stored on the reply (`rsvps.sms_consent`, `sms_consent_at`), separate from order-update permission. Texting must also be on in Notifications.
- STOP clears RSVP texting permission for that number everywhere (START restores it). Each text is re-checked against permission just before sending.
- Reminder and waitlist texts are held between 9 PM and 8 AM in the business's time zone; the daily job (moved to 18:17 UTC) sends anything held.
- **Platform switch:** nothing changes for guests until `RSVP_TEXTS=on` is set in Vercel. That should only happen after the Twilio campaign ("QueuedToGo Order Updates") is updated to cover event RSVP texts. Once it is on, /terms also describes RSVP texts.
- Tests: database 245, unit 110, RSVP browser 83 (all other suites unchanged and passing).

## Update: cover page
- Settings → **Cover page** → *Show a cover page first*. Visitors opening the form link see an opening page (artwork, the event date and place, a heading, a message, and one button). Pressing the button opens the form on the same link; focus moves to the form for keyboard and screen-reader users.
- RSVP forms default to "You're invited!" / "Accept your invitation"; order forms to "Welcome!" / "Start your order". The message keeps line breaks and supports `{business}`, `{form_title}` and `{date}`.
- Styling: the cover heading, message, button and artwork are their own elements in Design (colours, fonts, sizes, spacing, button states). The artwork can sit above, below, beside the words, or replace the heading (for a ready-made invitation card).
- The builder preview has a Cover / Form / Thank-you switch. Closed forms skip the cover and show the closed message.
- No database change: the cover lives in the form's settings and design, and appears for guests once the form is published.
- Tests: `tests/e2e/cover.py` 27 checks; all other suites still pass.
