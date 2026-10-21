# QueuedToGo: prototype → Next.js + Supabase migration plan

This plan maps the single-file prototype (`prototype/index.html`) onto the production app in this repository. The prototype is kept unchanged in `prototype/` along with its browser tests, so every behaviour can be checked against it while screens move over.

## 1. Prototype inventory

The prototype is one HTML file (about 1,600 lines of CSS and vanilla JavaScript). It has no framework, no backend and no build step. All state lives in one JavaScript object saved to `localStorage`. Uploaded images go to IndexedDB.

### Screens

| # | Screen | What it does | Status in prototype |
|---|--------|--------------|---------------------|
| 1 | Event forms | Grid of event forms: artwork thumbnail, status (Draft/Live/Closed), submission and open-job counts, plus "New event form" | Works (local data) |
| 2 | Form builder: Questions tab | Ordered block list. 17 block types: short answer, long answer, email, phone, number, choice, multi-select, dropdown, quantity per size, date, file upload, link button, heading, text, divider, artwork, page break. The Submit button is a movable block. Supports add, edit, reorder (drag or arrows), duplicate, delete, required, help text, placeholder, options, radio/checkbox list display, prefill-and-lock, and job field roles (customer name, item, due date) | Works |
| 3 | Form builder: Design tab | 10 collapsible sections: global theme (artwork upload, palette extraction, layout, 5 theme colours, contrast check), per-element styles (typography, size and spacing, background solid/gradient/texture/image, border, corners linked or per-corner, interactive states), typography, buttons, inputs and options, colours and brand palette, borders and corners, backgrounds and textures, artwork and images, advanced settings | Works |
| 4 | Form builder: Settings tab | Title, date, venue, intro, status, form link, thank-you message, auto-create job, update channel, consent checkbox | Works; form link is not a real URL |
| 5 | Builder preview | Live preview at desktop or phone width. Click to select an element, "+ Artwork" insert chips, file drop, forced state preview | Works |
| 6 | Public form (customer view) | Themed form, multi-page with Next/Back and progress, per-field validation, uploads, consent, thank-you screen with order number and tracking link | Works locally; no real URL |
| 7 | Submissions | Per-form table with one column per question, search, image thumbnails, stage column, "Copy as CSV", detail drawer | Works |
| 8 | Production board | Six-stage Kanban with drag and drop, "Move to next stage", event filter, summary stats (open, due today, overdue, updates sent today) | Works |
| 9 | Job drawer | Stage, assignee (fixed list of 4 names), due date, form answers, consent status, tracking link, activity history, internal notes, message history | Works; team list is hard-coded |
| 10 | Notifications | Per-stage on/off, message templates with `{name}` `{order}` `{event}` `{link}` `{business}`, message log | Simulated: nothing is sent |
| 11 | Tracking page | Customer status page in the event's design, with stage timeline and timestamps | Works locally; no real URL |

### Placeholders that must not be presented as real

- SMS, WhatsApp and email sending (simulated log only)
- Accounts, logins, roles and team members (none; the "workspace" is hard-coded as Threadtogo)
- Form and tracking links (`queuedtogo.app/...` text only)
- Sample data (three events with generated artwork)

### Design tokens to preserve

- App palette: `--bg #F2F3F7`, `--surface #FFFFFF`, `--surface-2 #E8EAF1`, `--fg #161A2B`, `--muted #5A6077`, `--line #D4D8E3`, `--accent #3346D3`, plus semantic good/warn/bad and six stage colours. A full dark palette is included.
- Type: Bricolage Grotesque (display), IBM Plex Sans (body), IBM Plex Mono (numbers and codes).
- Layout: sticky top bar with brand, workspace name and section tabs. Panels with 12px radius and 1px border. Ticket-style job cards with a dashed tear line.
- Form themes: Baloo 2, Oswald and Playfair Display are also used by the form font presets.

## 2. Route and component map

| Prototype view | Next.js route | Main components |
|----------------|---------------|-----------------|
| (none) | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm` | `AuthCard`, `Field`, `SubmitButton` |
| (none) | `/onboarding` (create first business) | `CreateOrgForm` |
| (none) | `/invite/[token]` | `AcceptInvite` |
| Top bar and tabs | `/w/[orgSlug]/layout.tsx` | `AppShell`, `SectionTabs`, `OrgSwitcher`, `UserMenu` |
| Event forms | `/w/[orgSlug]/forms` | `FormGrid`, `FormCard` |
| Form builder | `/w/[orgSlug]/forms/[formId]/edit` | `Builder`, `BlockList`, `BlockEditor`, `DesignPanel` (10 sections), `ColorPicker`, `TextureGrid`, `RadiusControl`, `FormRenderer` (edit mode) |
| Public form | `/f/[orgSlug]/[formSlug]` | `FormRenderer` (live mode), shared with the builder |
| Submissions | `/w/[orgSlug]/submissions` | `SubmissionsTable`, `OrderDrawer` |
| Production board | `/w/[orgSlug]/board` | `Board`, `Column`, `JobTicket`, `OrderDrawer` |
| Notifications | `/w/[orgSlug]/notifications` | `StageRules`, `MessageLog` |
| Tracking page | `/t/[token]` | `TrackingCard` |
| (new) | `/w/[orgSlug]/settings` | `OrgSettings`, `MembersTable`, `Invitations`, `StagesList` |

The prototype's pure logic moves into `src/lib/design/` with almost no changes: colour parsing, contrast, the texture SVG generator, the `elementsOf` list, element defaults, validated CSS generation and SVG sanitising. Both the builder preview and the public form render through the same `FormRenderer`, so the preview always matches the published form.

## 3. Data model mapping

| Prototype object | Table |
|------------------|-------|
| Workspace "Threadtogo" | `organizations` |
| Team names (Grace, Daniel, …) | `profiles` + `organization_members` (role: owner, admin, member) |
| `event` (title, date, venue, status, theme, design, settings) | `forms`. Draft design is in `forms.design` (jsonb, versioned). The published snapshot is in `forms.published_config`. |
| `event.fields[]` | `form_fields` (one row per block, `position` for order, `config` jsonb for block-specific settings) |
| `design.el[fieldId]` | stays inside `forms.design.el`, keyed by the field's UUID |
| `subs[]` | `form_submissions` |
| customer details inside each job | `customers` (deduplicated per business by email or phone) |
| `jobs[]` | `jobs` (per-business order number, private tracking token) |
| `STAGES` + `rules` | `workflow_stages` (per business; name, colour, position, notify flag, message template) |
| `job.events[]` | `job_events` (append-only audit log, written by a database trigger) |
| IndexedDB assets, `{asset:id}` refs | Supabase Storage + `files` table. Refs become `{file: uuid}`. |
| `brand.colors`, `recent` | `organizations.brand` (jsonb). Recent colours stay per browser. |

## 4. Proposed file structure

```
prototype/                 original prototype and its browser tests (unchanged)
docs/                      plan, setup, security checklist, stage reports
supabase/
  config.toml              local Supabase CLI config
  migrations/              version-controlled SQL migrations
  tests/                   RLS and trigger tests (run on any Postgres via scripts/test-db.sh)
scripts/                   db test runner
src/
  proxy.ts                 refreshes the Supabase session; guards workspace routes
  app/
    (auth)/                login, signup, forgot-password, reset-password
    auth/confirm/          email-link handler (confirm signup, recovery)
    auth/signout/          POST sign-out
    onboarding/            create first business
    invite/[token]/        accept invitation
    w/[orgSlug]/           workspace: forms, submissions, board, notifications, tracking, settings
    f/[orgSlug]/[formSlug] public form (Stage 5)
    t/[token]/             public tracking (Stage 5)
  components/ui/           Button, Field, Notice, Pill, SubmitButton, …
  components/shell/        AppShell, SectionTabs, OrgSwitcher, UserMenu
  lib/supabase/            browser client, server client, proxy session helper
  lib/auth.ts              requireUser(), requireMembership()
  lib/validation/          Zod schemas shared by forms and server actions
  lib/design/              (Stage 5) design engine moved from the prototype
  server/actions/          'use server' actions: auth, organizations, members
  types/database.ts        Supabase database types
```

## 5. Stages and what each one delivers

1. **Inventory and plan** (this document).
2. **Next.js scaffold**: App Router, TypeScript, prototype design tokens and fonts, app shell, Supabase clients, session proxy.
3. **Database**: migrations for all tables, constraints, indexes, RLS, helper and RPC functions, storage buckets and policies. Tests prove that one business cannot read or change another's data.
4. **Auth and workspaces**: sign-up, sign-in, sign-out, password recovery, protected routes, business creation, members, roles and invitations.
5. **Screens**: builder, design engine, public form, submissions, board and tracking rebuilt as React components.
6. **Persistence**: every screen reads and writes Supabase. Publishing a form writes an immutable snapshot. Public submissions go through a rate-limited server route.
7. **Security hardening**: abuse protection, signed URLs for private uploads, audit review, idempotent automation events.
8. **Deployment**: Vercel, custom domain, production checklist.
9. **Later**: Twilio SMS/WhatsApp and email notifications, run from server-side jobs with an outbox table for idempotency.

## 6. Risks and things that must not be lost

- **The builder's preview must equal the published form.** Keep one renderer and one CSS generator for both, and port the prototype's browser tests to the new app.
- **Design config compatibility.** `forms.design` keeps the prototype's shape (`v`, `shared`, `el`, `page`, `card`, `adv`) so designs can be imported and migrated by version number.
- **Validated CSS.** Every saved style value passes through whitelists and clamps before it becomes CSS (this is already done in the prototype's `elCss`). Never inject raw strings.
- **Tenant isolation.** Every business-owned row carries `org_id`. Child rows use composite foreign keys (`(parent_id, org_id)`), so a row can never point at another business's parent, even if application code has a bug.
- **Public endpoints.** Anonymous visitors never query tables directly. They use narrow `SECURITY DEFINER` functions that return only published or customer-safe fields.
- **Notifications are not built yet.** The UI must not show "sent" until Twilio and email are really connected.
- **Hard-coded team.** Assignees become real members of the business.
- **Dev-only audit warning.** `npm audit` reports a high-severity issue in `braces` through `eslint-config-next` (development only, not shipped). `npm audit --omit=dev` reports 0. Recheck when `eslint-config-next` updates.
