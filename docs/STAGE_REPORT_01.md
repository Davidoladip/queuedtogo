# Stage report 1: inventory, scaffold, database, authentication and workspaces (Stages 1 to 4)

## 1. Files created or changed

| Area | Files |
|---|---|
| Prototype (preserved) | `prototype/index.html`, `prototype/tests/test_design.py`, `prototype/tests/legacy-v2.html`, copied unchanged |
| Plan and docs | `docs/MIGRATION_PLAN.md`, `docs/SECURITY.md`, `docs/STAGE_REPORT_01.md`, `README.md` |
| Config | `next.config.ts` (security headers), `.env.example`, `.gitignore`, `package.json` scripts, `supabase/config.toml` |
| Database | `supabase/migrations/20261021000100_core_tenancy.sql`, `…0200_forms_and_production.sql`, `…0300_functions_and_storage.sql` |
| Database tests | `supabase/tests/00_supabase_stub.sql`, `supabase/tests/10_rls_test.sql`, `scripts/test-db.sh` |
| Types | `src/types/database.ts`, generated from the migrated schema with the Supabase CLI |
| Supabase wiring | `src/lib/env.ts`, `src/lib/supabase/{client,server,proxy}.ts`, `src/proxy.ts` |
| Auth and access | `src/lib/auth.ts`, `src/lib/urls.ts`, `src/lib/errors.ts`, `src/lib/validation/*`, `src/server/actions/{auth,organizations}.ts`, `src/app/auth/confirm/route.ts` |
| Pages | `/` (landing and business picker), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/onboarding`, `/invite/[token]`, `/w/[orgSlug]/{forms,submissions,board,notifications,tracking,settings}`, `/f/[orgSlug]/[formSlug]`, `/t/[token]`, error, loading and not-found pages |
| UI | `src/app/globals.css` (prototype tokens: colours, light and dark, type, panels, pills, board), `src/components/ui/*`, `src/components/shell/*` |
| App tests | `tests/e2e/smoke.py` |

## 2. Features implemented

- **Sign-up, sign-in, sign-out and password recovery**, using Supabase Auth with cookie sessions (`@supabase/ssr`). Email links are handled by `/auth/confirm`, which supports both `token_hash` and `?code=` links. Errors are shown in plain language, including when Supabase can't be reached.
- **Protected routes**: `src/proxy.ts` refreshes the session and redirects signed-out visitors to `/login?next=…`. Every protected page also checks the user on the server with `getClaims()`. Return paths are checked, so `?next=//evil.com` can't send people off the site.
- **Businesses (organizations)**: create one during onboarding (US defaults: Eastern time, USD, `+1` phone numbers). Switch between businesses from the top bar. Every workspace URL is `/w/{business-address}`.
- **Roles**: owner, admin and member.
  - **Owners and admins** edit business settings, invite people, change roles and remove people.
  - **Only owners** can make or remove owners, or delete the business.
  - **A business always keeps at least one owner.**
  - **Anyone can leave a business.**
- **Invitations**: owners and admins create a single-use link that lasts 7 days and works only when signed in as the invited email. Only a hash of the token is stored. Email sending isn't connected yet, so the link is shown for copying. The screen says so.
- **Workspace screens connected to the database** (read-only until Stage 5):
  - The forms list, submissions list and tracking list.
  - The production board, showing the business's 6 saved stages and its jobs.
  - Notification templates per stage, clearly marked "Sending is not connected yet".
- **Public tracking page** `/t/{token}`: shows order number, stage timeline and expected date. No customer details, notes or staff names.
- **Public form route** `/f/{business}/{form}`: reads only the published snapshot. It shows a closed message or a "being set up" message until the renderer moves over in Stage 5.

## 3. Database migrations added

Three migrations covering the 11 tables in the brief, plus `organization_invitations`:

- **Tables**: `organizations`, `profiles` (created automatically on sign-up), `organization_members`, `organization_invitations`, `workflow_stages`, `forms`, `form_fields`, `form_submissions`, `customers`, `jobs`, `job_events`, `files`.
- **Keys and constraints**:
  - **IDs**: UUID primary keys, plus timestamps with `updated_at` triggers.
  - **Checked values**: text length limits, colour codes, slug patterns, E.164 phone numbers, allowed block types, JSON size caps, and file types and size (10 MB).
- **Tenant isolation**:
  - **Row level security** on every table, with membership checks in `SECURITY DEFINER` helper functions.
  - **Composite foreign keys** (`(parent_id, org_id)`), so a field, job or file can never point at another business's form, stage or customer.
  - **No moving rows**: a trigger blocks changing `org_id`.
  - **Column-level grants**: the app can't write order counters, tracking tokens, published snapshots or audit events directly.
- **Audit history**: `job_events` is written by a trigger on every job change (created, stage, assignee, due date, details). It is append-only, and edits and deletes are rejected. `idempotency_key` is ready for automations.
- **Functions**: `create_organization`, `create_invitation`, `get_invitation`, `accept_invitation`, `publish_form` (snapshots fields and design), `get_public_form` and `get_job_tracking` (the only ways anonymous visitors can read data).
- **Storage**:
  - **`form-assets`**: public bucket for artwork on published forms.
  - **`submission-uploads`**: private bucket for customer files, read through signed URLs.
  - **Paths**: both buckets use `{org_id}/…` paths, with policies that limit each business to its own folder.

## 4. Tests and build checks

| Check | Result |
|---|---|
| `npm run test:db`: all migrations and 89 RLS, role, audit, storage and public-function tests on PostgreSQL 16 | **89/89 pass** |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no warnings |
| `npm run build` (Next.js 16.4.2) | Pass |
| `npm run test:smoke`: production build in Chromium | **21/21 pass** |
| `npm audit --omit=dev` (shipped dependencies) | 0 vulnerabilities |

The smoke tests cover:
- redirects and security headers
- sign-in and sign-up validation
- open-redirect protection
- friendly errors when Supabase is unreachable
- the invitation page when signed out
- phone layout
- browser script errors

## 5. Errors and unresolved issues

- **Not yet tested against your Supabase project.** This workspace's network blocks `supabase.co`, so the migrations haven't been applied to your project. Sign-up, sign-in, email links, invitations and the signed-in workspace pages haven't run end to end. The database rules they rely on are tested (section 4), and the pages build and type-check against the generated schema. Do the checklist below once.
- **Fonts** load from Google Fonts in the browser rather than through `next/font`, because the build environment here can't reach Google. This works in production; switching to `next/font` later is a small change.
- **`npm audit`** reports a high-severity issue in `braces`, through `eslint-config-next`. It's a development tool only, not shipped to users. Recheck when `eslint-config-next` updates.
- **Not started yet (by design)**:
  - creating and editing forms
  - the design engine
  - public submissions
  - moving jobs on the board
  - notifications
  - uploads through the app

### Checklist to run once on your Supabase project

1. `npx supabase login`, then `npx supabase link --project-ref lobaiwoefxzznkxyfxgd`, then `npm run db:push`.
2. Set the Auth URLs (README, section 3b).
3. `npm run dev`, then sign up with a real email address, open the confirmation link, and create a business.
4. In Settings, create an invitation. In a private window, sign up with the invited email, open the link and join.
5. Sign out, use **Forgot your password?**, open the email link and set a new password.
6. With a second account in a different business, try opening the first business's URL. You should get "We couldn't find that page".

## 6. Next recommended stage

**Stage 5: rebuild the form builder and public form as React components.**

- Move the prototype's design engine (colour utilities, element defaults, validated CSS generator, textures, SVG sanitiser) into `src/lib/design/` with unit tests.
- Build `FormRenderer` once and use it for both the builder preview and `/f/...`, then port the prototype's browser tests to it.
- Save forms, fields and design to Supabase, publish with `publish_form`, and upload artwork to the `form-assets` bucket.

Public submissions, which need the server secret key and rate limiting, follow in Stage 6, and the board actions after that.
