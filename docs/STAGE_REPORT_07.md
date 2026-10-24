# Stage report 7: email updates, team alerts and event-day tools (Stage 9)

## 1. Email
- **Order confirmation.** Every customer who gives an email address gets a "we've got your order" email with the order number, the items and a tracking button. It's a receipt for their order, so it doesn't depend on the updates box.
- **Stage updates by email.** Customers who chose email and ticked the updates box get each stage's message by email. The texting line "Reply STOP…" is removed, and every update has a **Stop order updates** link. Email customers don't also get a separate "order received" update, because the confirmation covers it.
- **New-order alerts for the team.** Everyone on the team gets an email for each new order, with a button that opens the job. Each person can switch their own alerts off under **Notifications → Your new-order alerts**.
- **Settings.** The **Notifications** page has:
  - email connection status (which settings are missing, never their values)
  - a **Send emails for this business** switch, off by default (owners and admins)
  - the contact address shown to customers in emails (the business's own inbox)
  - **Send a test email to me**
- **Sending.** Emails go out through **Twilio Email**, on the same Twilio account and bill as texts (no separate subscription). They come from QueuedToGo's verified address, with the business's name as the sender ("Threadtogo via QueuedToGo"). Twilio Email has no reply-to setting, so customer emails show the business's contact address instead. A send is retried only when Twilio clearly didn't accept it (busy or down), never after a dropped connection, so no email is sent twice. Everything customers or businesses type is escaped in the HTML.
- **Stop updates.** The link in emails opens the tracking page and asks the customer to confirm with a button, so email security scanners that open links can't turn updates off by accident. Stopping turns off texts and emails and cancels anything still waiting. The tracking page also shows the button whenever updates are on.
- **Message log.** It shows Text or Email, the subject, and shortened addresses (l•••@example.com).

## 2. Event-day tools (new **Event day** tab)
- **Pickup screen.**
  - Big search: order number, name, or the last 4 digits of the phone.
  - **Mark collected** moves the order to the final stage, then clears the search for the next customer.
  - Works on a phone or tablet. Only the last 4 digits of a phone number are sent to the screen.
  - Refreshes itself every 20 seconds.
- **Daily summary.** Open jobs, due today, overdue and finished today. It also shows jobs by stage and **what to make**: totals of each option, colour and size across open orders, plus the overdue and due-today lists. It prints cleanly.
- **Order tickets.** One per 4×6 in page, with the order number, customer, every answer, phone, stage, due date, assignee, and a **QR code that opens the job**. You can print them for the whole board, by form or stage, or for one job ("Print ticket" on the job page).
- **Labels.** Avery 5160 / 8160 sheets (30 per US Letter page): order number, name and items.
- **CSV export** (owners and admins, because it contains contact details). Every order, with customer details, consent, stage, due date, assignee and one column per question. It opens correctly in Excel (UTF-8). US phones are written as (555) 123-4567, and anything that looks like a spreadsheet formula is neutralised.

## 3. Database (migration `20261024101958_email_and_alerts`, applied to `queuedtogo-us`)
- `organizations.email_enabled` (off) and `reply_to_email`.
- `messages` now hold emails: confirmation and team_alert kinds, a subject, and address checks by channel.
- `member_alerts`: each member reads and changes only their own row.
- `queue_customer_message` replaced: it queues by channel, plus confirmations and team alerts.
- `stop_updates(token)`: public, but needs the 64-character private tracking link, and can only turn updates off.
- `get_job_tracking` now also says whether updates are on.
- **Security advisor:** the only new item is `stop_updates`, which is intentionally public as described.

## 4. Tests

| Check | Result |
|---|---|
| Typecheck, lint, production build | pass |
| Unit (Vitest) | 84/84, 16 new: email settings, confirmation and update wording, escaping, team alerts, the Twilio Email call (Twilio account, sender name, unsubscribe header, tags, no retry after a dropped connection), errors and retries, sending queued emails; item counts, CSV quoting and formula guard, pickup search, label text |
| Database (local Postgres) | 182/182, 18 new: email off by default; only owners and admins switch it on; reply-to checked; confirmation queued; no duplicate update; team alerts honour each member's choice; stage updates by email; stop from the tracking link (and a made-up link does nothing); waiting updates cancelled; email off queues nothing; email address checks |
| Browser: notifications | 43/43, 16 new for email settings, alerts, log and stop updates |
| Browser: event day (`tests/e2e/eventday.py`) | 27/27: pickup search (number, name, last 4), mark collected, phone layout, summary counts and totals, tickets with QR, 4×6 and Avery sizes, print view without app buttons, CSV contents and formula guard |
| Browser: builder, customisation, orders, board, smoke | 67/67, 64/64, 20/20, 51/51, 21/21 |
| Live database (rolled back) | A new email order queued one confirmation and one team alert, with no duplicate update; stopping from the tracking link turned updates off. Nothing left behind. |

**Not yet tested:** a real email through Twilio Email. That needs queuedtogo.com verified as a sender domain in Twilio and `EMAIL_FROM` in Vercel.
