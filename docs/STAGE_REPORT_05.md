# Stage report 5: the production board (Stage 7)

## 1. What the team can do
- **Board** (`/w/<business>/board`):
  - **Columns:** one per stage, with each job's order number, customer, summary and form.
  - **Cards:** show the assignee, due date, update channel (and whether the customer agreed), and Overdue, Due today, Done, High or Urgent tags.
  - **Summary:** open jobs, due today, overdue and unassigned.
  - **Filters:** by form, by person ("My jobs", "Unassigned" or a named teammate), and a search by order number or customer name.
  - **Ordering in a column:** urgent first, then soonest due, then oldest order.
- **Moving jobs:**
  - **How:** drag a card to another column, or press its "Move to … →" button. The button works with the keyboard and on phones.
  - **Feedback:** the card moves at once and a message confirms the move. If the save fails, the card goes back and the reason is shown.
  - **Two people moving the same job:** if a teammate already moved it, nothing changes. You're told where it now is and the board updates.
- **Live updates:** the board refreshes itself every 30 seconds, and whenever you return to the tab. Teammates' moves and new orders appear without reloading.
- **Job page** (click a card): change the stage, assignee, due date and priority; "Mark complete" and "Reopen"; edit the title and summary. It also has:
  - internal notes, which customers never see
  - the full history of who did what and when
  - the customer's contact details and consent
  - the tracking link, and a link to the order form answers (Submissions also links back to the job)
- **Stages** (`/w/<business>/board/stages`, owners and admins): rename, recolour, reorder, add (up to 12), delete empty stages (after confirming) and mark final stages. Members can see the stages but not change them.
- **Customer tracking page:** shows each move, refreshes itself every minute, and says "Your order is complete" at a final stage. It still shows no notes, staff names or contact details.
- **Finished jobs:** they stay in the final column for 14 days, then drop off the board. They remain in Submissions and Tracking.

## 2. Database (migration `20261022190847_board`, applied to `queuedtogo-us`)
- **Completion time follows the stage.** A job gets its completion time when it reaches a final stage, and loses it when it leaves. The app can't set it directly. When a stage is switched to or from final, its jobs follow.
- **Stage rules, enforced by the database:**
  - up to 12 stages per business
  - a business always keeps at least one stage
  - the first stage, where new orders arrive, can't be final
  - a stage with jobs can't be deleted
- **`reorder_stages`:** reorders all of a business's stages in one step. It runs with the caller's own permissions, is owners and admins only, and refuses lists with missing, duplicate or other businesses' stages.
- **Deleting a whole business that has jobs** now works. The job-to-stage link is checked at the end of the delete instead of blocking it.
- **Existing permissions are unchanged.** Members can move, assign and annotate jobs, but can't change order numbers, tracking links or history. Other businesses can't see or touch any of it.
- **Security advisor:** no new warnings. The new trigger functions can't be called directly.

## 3. Tests

| Check | Result |
|---|---|
| Typecheck, lint, production build | Pass |
| Unit tests (Vitest) | 50/50, including 10 new tests for time zones, overdue status, ordering, stage helpers, history wording and input checks |
| Database (local Postgres) | 149/149, including 29 new: moves, out-of-date moves, completion time, reopening, member and owner rights, reordering rules, stage limits and guards, other businesses blocked, deleting a business with jobs |
| Browser: board (`tests/e2e/board.py`) | 51/51 — summary counts, card details, move button, drag and drop, saving, conflicting moves, self-refresh, keyboard, screen-reader announcements, filters, every job-page control, notes, history, mark complete and reopen, the stage editor (rename, add, reorder, delete, guards, member view), phone layout and tap-to-move |
| Browser: builder, customisation, orders, smoke | 67/67, 59/59, 18/18, 21/21 |

**Checked on the live database** (inside a transaction that was rolled back): moves, completion and reopening, reordering, the guards, and that the existing order QTG-1001 is untouched.

**Not checked here:** the signed-in board pages against live Supabase. This workspace can't sign in to queuedtogo.com. The same components and rules are covered by the harness and database tests above; the first real use of the live board is the final check.

## 4. Not in this stage
- **Customer text messages when a job moves** (Stage 8, Twilio). Each stage's "notify customer" setting and the customer's consent are already stored.
- **Instant (push) updates** between devices. The board refreshes every 30 seconds instead.
