# Stage report 4: public orders (Stage 6)

## 1. What happens when a customer sends a form
1. **In the browser:** the form checks the answers for quick feedback, then sends them to the app server. Each send carries the form's published version, a one-time retry key and a hidden trap field for bots.
2. **On the server** (`submitOrder`, `src/server/actions/submit.ts`):
   - It loads the **published** form and refuses forms that aren't live, plus answers to an older version ("reload and try again").
   - `checkSubmission` (`src/lib/submission.ts`) checks every answer against the published form:
     - required answers, length limits, email and US/E.164 phone numbers (stored as `+1…`)
     - numbers and dates
     - choices that must be among the options, and sizes as whole numbers
     - colour choices that must be among the swatches, including the required colour for a picked option
     - uploads: PNG, JPG, WebP or PDF, up to 10 MB each and 25 MB in total, with the file's first bytes checked against its type
   - Locked answers always come from the form. Fields that aren't on the form are ignored.
   - Customer files go to the **private** `submission-uploads` bucket under `{business}/{form}/{submission}/…`. If the order fails, they're deleted.
   - The visitor's IP address is never stored. Only a keyed hash is kept, for rate limits.
3. **In the database** (`submit_form`, one transaction, callable only by the server):
   - It applies rate limits: 10 orders per visitor per form per 10 minutes, and 120 per form per minute.
   - A repeated or simultaneous click with the same retry key returns the first order.
   - It finds the customer by email, then phone, or creates them, and records consent with the time.
   - It stores the answers, including each question's label as it was at the time, and records the uploaded files.
   - It creates a numbered job (QTG-1001, QTG-1002…) in the business's first production stage, with a title and summary.
4. **The customer sees** the thank-you screen with the real order number, the business's own thank-you message and a tracking link (`/t/<token>`). They can also start another order.
5. **The business sees** the order in **Submissions**, which lists orders and can be filtered by form. Each order has a page with:
   - the answers, as labelled when the customer answered
   - customer details and consent
   - uploaded files through 10-minute private links
   - the tracking link
   
   The job also appears on the **Production board**.

## 2. Database
- **Migration** `20261022113251_submissions.sql`, applied to `queuedtogo-us`:
  - adds `form_submissions.client_key` with a unique index per form
  - adds `submit_form(...)`, a security-definer function whose `execute` is granted to `service_role` only
  - updates `get_public_form` to also return the published `version`
- **Security advisor:** `submit_form` isn't flagged, because visitors and signed-in users can't reach it. No new warnings.

## 3. Setup needed
- **Required:** `SUPABASE_SECRET_KEY` in Vercel (Production and Preview). Find it at Supabase → Project Settings → API Keys → Secret keys. It's used only on the server, for `submit_form` and the private upload bucket. Until it's set, public forms say "Online ordering isn't switched on for this form yet" and nothing is sent.
- **Optional:** `SUBMISSION_IP_SALT`, the key for the visitor-IP hash. It defaults to the secret key.

## 4. Tests

| Check | Result |
|---|---|
| typecheck, lint, production build | pass |
| Unit (Vitest) | 40/40, including 11 for answer checks: phone normalising, required and colour rules, refusing options that aren't on the form, locked answers, bot trap, file type and content checks |
| Database (local Postgres) | 120/120, including 20 new: visitors and signed-in users can't call `submit_form`; numbered jobs; customer matching and consent; files only in the business's folder; repeat clicks; older versions, draft and closed forms refused; rate limit; cross-business isolation |
| **Live Supabase** (rolled back, nothing left) | As the server role: order QTG-1001 created with a 64-character tracking token, the repeat click returned the same number, the job landed in "New order", customer consent was recorded and the tracking page found the order. Visitor and signed-in calls were refused. The job counter went back to 1001 after rollback. |
| Browser: orders (`tests/e2e/orders.py`) | 18/18: thank-you screen with number and tracking link, cleaned answers, next order number, refused tampered answers shown on the question, double click gives one order, "not switched on" without the key, phone layout |
| Browser: builder, customisation, smoke | 67/67, 59/59, 21/21 |

**Not yet run end to end on the live site:** a real customer order through queuedtogo.com, a file uploaded to the private bucket, and the Submissions detail page with signed file links. These need the secret key in Vercel first; that one check can't run from this workspace.

## 5. Not in this stage
- **Text and email notifications** to customers when their order moves stage (Twilio). The consent and channel are recorded and ready.
- **Moving jobs on the board**, assigning people and adding notes. These are the board actions in the next stage.
- **Captcha:** the bot trap and rate limits are the first line of defence. A captcha such as Cloudflare Turnstile can be added if spam appears.
