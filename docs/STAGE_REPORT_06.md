# Stage report 6: customer text updates (Stage 8)

## 1. How it works
1. **The texting switch.** A business owner or admin switches texting on under **Notifications**. It starts off for every business.
2. **Queuing.** When a job is created in, or moved to, a stage with updates switched on, the database queues a text in the same step as the move (`queue_customer_message`). It's queued only if:
   - the customer ticked the consent box on the form
   - they chose SMS and have a mobile number
   - the business has texting on
   - the same stage hasn't already texted them about this job in the last 10 minutes (so dragging a card back and forth sends nothing extra)

   Otherwise the update is logged as **Not sent**, with the reason.
3. **Sending.** After replying to the person who moved the job (or to the customer who placed the order), the server sends the queued texts through Twilio's Messages API:
   - Each text is *claimed* first, so two servers can never send it twice.
   - Temporary errors (Twilio busy or unreachable) are retried up to 3 times. Texts more than a day old are dropped, not sent late.
   - If Twilio isn't set up, texts are marked "Texting isn't connected to Twilio yet" instead of pretending to send.
4. **Wording.** Each stage's message fills in `{name}` (first name), `{order}`, `{link}` (the tracking page), `{business}` and `{stage}`. "Reply STOP to opt out." is added if the message doesn't mention STOP.
5. **Delivery updates.** Twilio reports delivery to `/api/twilio/status`, and the log shows Sent, Delivered, Not delivered or Failed, with plain-words reasons for common carrier errors.
6. **STOP and START.** Replies arrive at `/api/twilio/inbound`. STOP turns off updates for that number in every business, because one sender is shared. START turns them back on for customers who had agreed before. Twilio sends the standard confirmations itself.
7. **Who sees what.**
   - The **Notifications** page shows the Twilio connection status (which settings are missing, never their values), the switch, each stage's message with a live preview and text count, a test-text sender (owners and admins, up to 5 an hour) and the message log.
   - **Each job page** lists the texts sent about that job, and the history notes "Customer update sent".

## 2. Security
- **Twilio credentials** are server-only environment variables, never sent to the browser.
- **Webhooks** are refused unless their `X-Twilio-Signature` matches. That's an HMAC of the exact public URL and every field, keyed by the Auth Token, compared in constant time, and the request must also carry our Account SID. The signature code reproduces Twilio's published example.
- **The message log** (`messages`) can only be written by the server. Members can read their own business's log, other businesses can't see it, and nobody can edit or delete it. Phone numbers are shortened (•••• 4567) on the server before the log reaches the browser.
- **Switching texting on and off** is limited to owners and admins, enforced by the database.

## 3. Database (migration `20261022200122_notifications`, applied to `queuedtogo-us`)
- `organizations.texting_enabled`: off by default.
- The `messages` table, with RLS and indexes.
- The `queue_customer_message` trigger on job history. Its function can't be called directly.
- Existing data is untouched. Texting is off, so nothing is sent until the owner switches it on and Twilio is connected.

## 4. Tests

| Check | Result |
|---|---|
| Typecheck, lint, production build | pass |
| Unit (Vitest) | 68/68, including 18 new: Twilio settings, wording and opt-out line, text counts, the Messages API call (fake Twilio), retryable errors, status mapping, Twilio's published signature example, forged signatures, STOP/START words, and sending queued texts against a fake database (claims, no double sends, retries, STOP, not-connected, stale texts) |
| Database (local Postgres) | 164/164, including 15 new: texting off by default; queued on move with number, message and who; quiet stages; no double text; no consent; WhatsApp/email; app can't write, edit or delete messages; members read but can't switch texting; other businesses blocked; online orders queue a confirmation |
| Browser: notifications (`tests/e2e/notify.py`) | 27/27 settings, preview, placeholders, saving, undo, log, shortened numbers, member view, job page texts, phone layout; plus 11/11 webhook checks with test Twilio settings (signed accepted; wrong key, altered fields, other account and unsigned refused) |
| Browser: builder, customisation, orders, board, smoke | 67/67, 59/59, 18/18, 51/51, 21/21 |
| Live database (rolled back) | Texting off by default; with texting on and consent, a move queues a text with the customer's number; the app can't write messages directly. Nothing left behind. |

**Not yet tested:** a real text through Twilio. That needs a Twilio account, an approved sender, and the settings in Vercel. This workspace can't reach Twilio, and no text has been sent.

## 5. Still to come
- **WhatsApp and email updates.** The customer's choice is already recorded; until then those customers are logged as "Not sent".
- **Quiet hours** (holding texts overnight).
- **One Twilio subaccount and registration per business.** This is the long-term ISV setup, needed once several businesses use texting.
