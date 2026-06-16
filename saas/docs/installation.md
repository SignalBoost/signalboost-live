# Installation Guide

This guide walks through standing up the SignalBoost SaaS / Hub Console from a
clean clone to a running deployment. It is written against the real repository
layout — the deployable application lives in the **`saas/`** directory.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 20.x** | Next.js 16.2.6 requires Node 18.18+; 20 LTS is recommended. |
| **npm** | Ships with Node. (No other package manager is assumed.) |
| **A Supabase project** | Primary application database. A second Supabase project is optional (marketing site). |
| **A Stripe account** | Required only if you enable billing/checkout. |
| **A host for Next.js** | Vercel is the reference target; any Node host that runs `next build` / `next start` works. |

Provider credentials (GitHub, AWS, Twilio, etc.) are **optional** — the Hub
Console treats any provider without credentials as "not connected," and only the
providers with working executors are actionable.

---

## 2. Clone and install

```bash
git clone https://github.com/SignalBoost/signalboost-live.git
cd signalboost-live/saas        # the app lives in saas/, not the repo root
npm install
```

> The Vercel project's **Root Directory** is set to `saas`. If you deploy
> elsewhere, point your build at `saas/`, not the repository root.

---

## 3. Configure environment variables

Copy the example file and fill in values:

```bash
cp .env.example .env.local
```

`saas/.env.example` documents every variable the code reads, grouped by purpose.
At minimum, set the **Core** and **Access control** sections:

```bash
# Core (required)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service-role / secret key>   # server-only, never exposed
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Access control (required for the Hub Console)
OWNER_EMAILS=you@example.com         # ⚠️ grants owner access to hub actions
ADMIN_EMAILS=teammate@example.com
```

Everything else is optional and only needed for the features/providers you turn
on (Stripe price IDs for billing, AI provider keys, per-provider Hub
credentials, `VAULT_MASTER_KEY` for the secrets vault, SMTP for email, etc.).
See the comments in `.env.example` for each group.

> **Naming:** use the canonical names. `SUPABASE_SERVICE_ROLE_KEY` (not the
> legacy `SUPABASE_SERVICE_KEY`) and `VERCEL_HUB_PROJECT` (with `VERCEL_PROJECT_ID`
> as an automatic fallback). The old names are still read as fallbacks but new
> setups should use the canonical ones.

---

## 4. Set up the database

The schema is provided as SQL migrations in `saas/supabase/migrations/`. Apply
them to your Supabase project **in filename (date) order** — either through the
Supabase SQL editor or the Supabase CLI:

```bash
# with the Supabase CLI (from saas/):
supabase db push
# — or paste each file in supabase/migrations/ into the SQL editor, oldest first.
```

Two things to do **in addition** to the migrations:

1. **Create the audit table.** The unified audit adapter writes to `hub_audit_log`,
   whose schema lives in the header comment of `saas/lib/hub/audit.ts`. Run that
   `create table hub_audit_log (...)` statement once. (The adapter is fail-safe —
   the app won't break if the table is missing, but audit events won't persist
   until it exists.)

2. **Generate a vault master key** (only if you use the secrets vault). Generate
   a 64-hex-character key and set it as `VAULT_MASTER_KEY` in your host's
   environment. Keep it stable — rotating it invalidates stored secrets.

> **Known issue:** one migration file is named `20260512_create_core_tables.sq`
> (missing the `l` in `.sql`). Rename it to `.sql` before applying, or it will be
> skipped by tooling that filters on extension.

---

## 5. Run locally

```bash
npm run dev      # http://localhost:3000
```

Available scripts (from `saas/package.json`):

| Script | Purpose |
|---|---|
| `npm run dev` | Local dev server (Turbopack). |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm test` | Node test suite. |

---

## 6. Deploy (Vercel reference flow)

1. Import the repository into Vercel.
2. **Set Root Directory to `saas`** (Project → Settings → General).
3. Add every required environment variable (Project → Settings → Environment
   Variables) — mirror your `.env.local`. Remember `OWNER_EMAILS`.
4. Deploy.

When you change environment variables or want a clean build, redeploy **without**
the build cache: Deployments → ⋯ → Redeploy → uncheck **"Use existing Build
Cache."**

Any host that runs `next build` then `next start` works equally well; only the
Root Directory and environment-variable steps are Vercel-specific.

---

## 7. First run

1. Visit `NEXT_PUBLIC_APP_URL` and sign in.
2. Owner/admin access is granted by `OWNER_EMAILS` / `ADMIN_EMAILS` (or a
   `team_members` owner row). If your email isn't listed, you won't have access
   to the Hub Console — this is intentional; there is no implicit fallback owner.
3. New tenants are guided through the onboarding wizard at `/onboarding`.
4. The Hub Console is at `/hub`. Providers with credentials show as connected and
   their actions are live; providers without are shown as "coming soon."

---

## 8. Continuous integration

The repository includes `.github/workflows/saas-ci.yml`, which runs **typecheck →
build → test** on every push to `main` and on pull requests. After deploying,
confirm the workflow is green; it will catch type errors and build breaks before
they reach production.

---

## Quick checklist

- [ ] Node 20 installed
- [ ] `cd saas && npm install`
- [ ] `.env.local` filled (Core + `OWNER_EMAILS` at minimum)
- [ ] Migrations applied in order (+ rename the `.sq` file)
- [ ] `hub_audit_log` table created
- [ ] `npm run build` passes locally
- [ ] Deployed with Root Directory = `saas` and env vars set
- [ ] Signed in as an `OWNER_EMAILS` address; `/hub` loads
