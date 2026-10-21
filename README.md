# QueuedToGo

Order forms for live events that turn every submission into a tracked production job, with customer updates at each stage.

Built with Next.js 16 (App Router, TypeScript, React 19) and Supabase (Postgres, Auth, Storage, Row Level Security). The original single-file prototype is kept in [`prototype/`](prototype/) as the design and behaviour reference.

- Migration plan and screen map: [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md)
- What's built so far: [`docs/STAGE_REPORT_01.md`](docs/STAGE_REPORT_01.md)
- Production security checklist: [`docs/SECURITY.md`](docs/SECURITY.md)

---

## 1. Local development

Requirements: Node.js 20.9 or later, npm, and a Supabase project.

```bash
npm install
cp .env.example .env.local      # then check the values (see "Environment variables")
npm run dev                     # http://localhost:3000
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm run test:db` | Run all migrations and 91 security tests on a throwaway local Postgres |
| `npm run test:smoke` | Browser smoke tests against a running app (`APP_URL`, default `http://localhost:3000`) |
| `npm run test:prototype` | The prototype's own browser tests |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:types` | Regenerate `src/types/database.ts` from the linked project |

The smoke and prototype tests use Python with Playwright: `pip install playwright && playwright install chromium`.

## 2. Environment variables

| Name | Where it's used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | No. Your project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server | No. Designed to be public; every query is limited by RLS. |
| `NEXT_PUBLIC_SITE_URL` | Links in emails and invitations | No. `http://localhost:3000` locally, your domain in production. |
| `SUPABASE_SECRET_KEY` | Server only (Stage 6, public form submissions) | **Yes.** Never prefix with `NEXT_PUBLIC_`, never commit. |
| `SUBMISSION_IP_SALT` | Server only (Stage 6, rate limiting) | **Yes.** Any long random string. |

`.env.local` is ignored by Git. `.env.example` lists every variable without secrets.

## 3. Supabase project setup

Do this once for each Supabase project (for example one for staging and one for production).

### 3a. Apply the database migrations

The migrations in `supabase/migrations/` create every table, constraint, index, RLS policy, function and storage bucket. Apply them with the Supabase CLI (installed with `npm install`):

```bash
npx supabase login                                   # opens the browser once
npx supabase link --project-ref ejeexndyexivsgjqlhuh # queuedtogo-us (us-east-1)
npm run db:push                                      # applies any migrations not yet applied
npm run db:types                                     # optional: regenerate TypeScript types
```

No CLI? In the Supabase dashboard, open **SQL Editor**, and run each file in `supabase/migrations/` in filename order. Use the CLI from then on, so the project tracks which migrations it has.

Never change the schema by hand in the dashboard. Add a new migration file instead: `npx supabase migration new describe_change`.

### 3b. Authentication URLs

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your production address, e.g. `https://app.yourdomain.com`. Use `http://localhost:3000` until you deploy.
- **Redirect URLs**: add all of these:
  - `http://localhost:3000/**`
  - `https://*-your-vercel-team.vercel.app/**` (Vercel preview deployments)
  - `https://app.yourdomain.com/**`

### 3c. Email and sign-in settings

**Authentication → Sign In / Providers → Email**:

- Keep **Confirm email** on.
- Set **minimum password length** to 8 or more.
- Turn on **leaked password protection** if your plan includes it.

The default email templates work as they are: their links go to `/auth/confirm`, which signs the person in. Optionally, for links that work on a different device or browser, edit **Authentication → Emails** and change the link in these templates:

- Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`
- Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

**Before real customers sign up, set up custom SMTP** (**Authentication → Emails → SMTP settings**), for example with Resend, Postmark or Amazon SES. Supabase's built-in email is for testing only and sends very few messages per hour.

### 3d. Recommended: asymmetric JWT signing keys

**Project Settings → JWT Keys**: migrate to the new signing keys. The app verifies sessions with `supabase.auth.getClaims()`, which checks asymmetric tokens locally instead of calling Supabase on every request.

## 4. Testing

```bash
# Database: migrations + RLS on a throwaway local Postgres 15+ (needs psql)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db

# App: build, start, then run the smoke tests
npm run build && npm start &
npm run test:smoke
```

`test:db` uses a small stand-in for Supabase's `auth` and `storage` schemas (`supabase/tests/00_supabase_stub.sql`), so it runs on plain Postgres. Before going live, also test sign-up, sign-in, password reset and invitations by hand against your Supabase project. The checklist is in `docs/STAGE_REPORT_01.md`.

## 5. Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repository. The framework is detected as Next.js; keep the default build settings.
3. In **Settings → Environment Variables**, add the variables from section 2 for **Production** and **Preview**. Set `NEXT_PUBLIC_SITE_URL` to the production address for Production. For Preview, leave it unset, so the app uses the preview URL.
4. Deploy. Then add the deployment URL to Supabase **Redirect URLs** (section 3b).
5. Every push to `main` deploys to production. Every pull request gets a preview URL.

## 6. Custom domain

1. Vercel → Project → **Settings → Domains** → add `app.yourdomain.com`, or the root domain.
2. At your domain registrar, create the DNS record Vercel shows. This is usually a `CNAME` to `cname.vercel-dns.com` for a subdomain, or an `A` record for the root. Vercel issues the HTTPS certificate automatically.
3. Update `NEXT_PUBLIC_SITE_URL` in Vercel and redeploy.
4. In Supabase, set **Site URL** to the new domain and add `https://app.yourdomain.com/**` to **Redirect URLs**.
5. Once custom SMTP is set up, use a sender address on the same domain and add the SPF and DKIM records your email provider gives you.

## 7. Project layout

```
prototype/            original HTML prototype + its tests (reference, unchanged)
docs/                 plan, stage reports, security checklist
supabase/migrations/  SQL migrations (source of truth for the database)
supabase/tests/       RLS tests + Supabase stand-in for plain Postgres
scripts/test-db.sh    runs migrations + RLS tests on a throwaway database
tests/e2e/            browser smoke tests
src/proxy.ts          refreshes the session cookie; redirects signed-out visitors
src/app/              routes: (auth), onboarding, invite, w/[orgSlug]/*, f/, t/
src/components/       UI and app shell
src/lib/              Supabase clients, auth helpers, validation, error messages
src/server/actions/   Server Actions (all input validated with Zod, all writes go through RLS)
src/types/database.ts generated Supabase types
```
