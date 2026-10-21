# Production security checklist

Tick every item before real customers use the app.

## Secrets
- [ ] `SUPABASE_SECRET_KEY` and any Twilio credentials are set only in Vercel's server environment variables, never with a `NEXT_PUBLIC_` prefix and never in Git.
- [ ] `.env.local` is not committed (`git ls-files | grep .env` shows only `.env.example`).
- [ ] The Supabase database password is stored in a password manager, not in the repository.
- [ ] Old keys are rotated if they were ever pasted into chat, email or a ticket.

## Database and RLS
- [ ] All migrations are applied with `npm run db:push`; no schema changes were made by hand.
- [ ] Supabase **Database → Advisors** (security and performance) shows no warnings for `public` tables.
- [ ] Every table in `public` has RLS enabled. Check with `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;`, which should return no rows.
- [ ] `npm run test:db` passes on the same migrations.
- [ ] Two real test accounts in two businesses confirm that neither can see the other's forms, jobs, customers or files, even by editing URLs.

## Authentication
- [ ] Email confirmation is on.
- [ ] Minimum password length is 8 or more; leaked password protection is on (if your plan allows).
- [ ] Custom SMTP is configured, with SPF and DKIM records for the sending domain.
- [ ] Site URL and Redirect URLs list only your real domains (no stray `*` wildcards on other hosts).
- [ ] Asymmetric JWT signing keys are enabled.
- [ ] Consider requiring MFA for owners once the plan allows.

## Public endpoints (Stage 6 onwards)
- [ ] Public form submissions go through the server route only. The browser never writes to `form_submissions`; the database already blocks it.
- [ ] Submissions are rate-limited per form and per salted IP hash, and validated against the published form's fields.
- [ ] Customer uploads go to the private `submission-uploads` bucket and are shown through signed URLs that expire within minutes.
- [ ] SVG artwork is sanitised on the server before storage. The prototype's sanitiser must be ported to the server side.

## App
- [ ] Security headers are present (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`). `npm run test:smoke` checks these.
- [ ] `npm audit --omit=dev` reports no vulnerabilities in shipped dependencies.
- [ ] Vercel deployment protection is on for preview deployments if they use production data.
- [ ] Error pages do not show stack traces (Next.js production builds hide them).

## Operations
- [ ] Supabase backups (daily, or point-in-time recovery on paid plans) are on, and a restore has been tested once.
- [ ] Audit history (`job_events`) is append-only. The database rejects edits and deletes; only deleting the whole job or business removes its history.
- [ ] Automations and notifications (later stages) use `job_events.idempotency_key` or an outbox table, so retries never send the same message twice.
