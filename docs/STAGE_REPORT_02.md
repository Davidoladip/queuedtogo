# Stage report 2: form builder, public form and deployment (Stage 5)

Live site: **https://queuedtogo.com** (www and queuedtogo.vercel.app also work) (Vercel project `queuedtogo`, region iad1, deploys on every push to `main`).
Database: Supabase `queuedtogo-us` (`ejeexndyexivsgjqlhuh`, us-east-1).

## 1. What was built

| Area | Files |
|---|---|
| Design engine (ported from the prototype) | `src/lib/design/color.ts`, `engine.ts`, `fromDb.ts`, `image.ts` |
| Shared renderer | `src/components/form/FormRenderer.tsx`, `form.css` |
| Builder | `src/components/builder/{Builder,QuestionsPanel,DesignPanel,SettingsPanel,controls}.tsx`, `draft.ts`, `builder.css` |
| Pages | `/w/[org]/forms` (list and create), `/w/[org]/forms/[formId]` (builder), `/f/[org]/[form]` (public form) |
| Server | `src/server/actions/forms.ts` (create, save draft, publish, close, delete), `src/lib/validation/form.ts` |
| Database | `supabase/migrations/20261021200000_form_builder.sql` (`save_form_draft`) |
| Tests | `src/lib/design/engine.test.ts`, `tests/e2e/builder.py`, 9 new checks in `supabase/tests/10_rls_test.sql` |
| Dev harness (404 unless `QTG_DEV_HARNESS=1`, never on Vercel) | `src/app/dev/{builder,form}` |

### Features
- **Forms list:** create a form. It starts with name, phone, an item choice and notes.
- **Questions tab:**
  - edit text, help text, placeholders, options and required
  - 17 block types, including page breaks for multi-step forms
  - reorder, duplicate and delete
- **Design tab:**
  - event artwork upload (PNG, JPG, WebP or SVG; SVG is converted to PNG in the browser)
  - three layouts and "match form colours" from the artwork palette
  - five theme colours, five font styles, four corner shapes, page and card textures
  - styling for the selected element (text colour, size, weight, alignment, background, border, corners, width, hover and selected colours), applied to one element or to all of its kind
- **Settings tab:**
  - title, date, venue, form address, thank-you message
  - SMS/WhatsApp/email consent checkbox
  - publish, close, reopen, back to draft, delete
- **Editing:**
  - autosave after a pause, and saves never overlap
  - undo and redo (Ctrl+Z / Ctrl+Shift+Z)
  - desktop and phone preview; clicking any part of the preview selects it
- **Publishing:** `publish_form` snapshots the draft. The public page reads only the snapshot, so draft edits never reach customers until they are published.
- **Public form:**
  - themed and multi-page, with a progress bar
  - checks required answers, email addresses and US/E.164 phone numbers
  - closed forms show a closed message

## 2. Security
- **Saving drafts:** `save_form_draft` is `SECURITY INVOKER`, so the caller's RLS and column grants apply. It runs in one transaction and refuses field ids that belong to another form.
- **Validation:** every save is checked with Zod on the server, and the design is re-normalised there, so only known keys are stored. Design JSON is capped at 200 KB.
- **CSS from designs:** every value is clamped, whitelisted or parsed as a colour. Element ids must match `[A-Za-z0-9_-]`. The output can't close its `<style>` tag. Unit tests cover these injection attempts.
- **Images:** they load only from `form-assets/{org-uuid}/…` paths. Arbitrary URLs and `data:` URLs are ignored. Links allow only http(s), mailto and tel.
- **Vercel settings:** the only values set are the Supabase URL, the publishable key and the site URL. No secret keys are stored in Vercel.

## 3. Tests

| Check | Result |
|---|---|
| `npm run test:db` (migrations plus RLS on Postgres 16) | 100/100 |
| `npm run test:unit` (engine and validation) | 19/19 |
| `npm run test:builder` (builder and public form in Chromium) | 42/42 |
| `npm run test:smoke` | 21/21 |
| typecheck, lint, build | Pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Vercel production build | Ready |

The builder tests run against the dev harness, which saves to memory, because the build sandbox can't reach Supabase. Saving, uploading and publishing against the real project still need the hand check below.

## 4. Open items
1. **Apply `save_form_draft` to the live project.** The connector's approval was cancelled three times. Run the migration file in the Supabase SQL Editor, or use `npm run db:push`.
2. **Optional hardening:** remove `image/svg+xml` from the `form-assets` bucket's allowed types (Storage → form-assets → Edit).
3. **Supabase Auth URLs:** set Site URL to `https://queuedtogo.com` and add `https://queuedtogo.com/**` and `https://queuedtogo.vercel.app/**` to Redirect URLs. Keep `http://localhost:3000/**`.
4. **Hand check on the live site:** create a form, upload artwork, publish, open the public link, close the form.
5. **Not in this stage:**
   - **Submissions (Stage 6):** submitting says "opens soon" and nothing is sent.

## 5. Update: full prototype Design tab (Stage 5b)

The Design tab now has all ten sections from the prototype:

| Section | Contents |
|---|---|
| Global theme | Event artwork (upload or drop), colours found in the artwork, match form colours, three layouts, five theme colours, contrast check |
| Individual element styles | Pick any element (or click it in the preview). Style **this element only** or **all elements of its kind**, and choose a part (label or input). Typography, size and spacing, background (solid, gradient, texture, image), border and corners (per-corner radius), interactive states (hover, pressed, focus, error, disabled, selected) with live state preview, contrast checks, reset |
| Typography | Font style presets; shared styles for all labels, headings and text |
| Buttons | Submit text; the full style set for all buttons; quick links to style one button |
| Text boxes and input fields | Full style set for all inputs, and for choice/radio/checkbox options |
| Colours and brand palette | Business brand colours (saved on the business; owners and admins can change them), recently used colours (this browser), theme colours, artwork colours |
| Borders and corners | Corner style for the whole form; button and input borders |
| Backgrounds and textures | Page and form colours with 10 textures, colour, strength and pattern size |
| Artwork and images | Place new artwork at a chosen position, drop zone, list with edit, move, duplicate and delete. **+ Artwork** buttons appear between blocks in the preview, and images can be dropped onto the preview |
| Advanced settings | Disable Next and Submit until required questions are answered; progress bar; copy the design from another form; reset all styles (with undo) |

Also new:
- **Round colour picker:** a saturation/brightness square, hue and opacity sliders, HEX or RGBA input, copy, and brand, recent and form colours.
- **Prefill and lock answers:** for short-answer, email, phone, number and date questions.

Security fix found by the new unit tests: an element id of `__proto__` could change the shared object prototype. Such ids are now rejected in the design path logic and when designs are loaded.

Tests: 25 unit, 67 builder/browser, 21 smoke, 100 database checks, all passing.
