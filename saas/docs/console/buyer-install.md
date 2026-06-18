# Console Hub & PR Cockpit — Install Guide (Next.js + Vercel)

This guide installs the portable Console Hub and PR Cockpit into a Next.js (App
Router) application deployed on Vercel, backed by Supabase.

## 1. Prerequisites

- A Next.js App Router project (Node 18+).
- A Supabase project (used for sessions, the credential vault, hub user roles,
  and the PR queue).
- A hosting target that runs Node server routes (Vercel recommended).

## 2. Bring in the console

Copy these portable folders into your app:

- `console-core/` — the host-agnostic action engine + provider executors.
  Imports nothing app-specific. This is the part you keep verbatim.
- `lib/hub/` — provider templates, catalog, action policy, audit, PR engine,
  redaction, bootstrap SQL.
- `components/hub/` — the console UI (shell, cards, pages).
- `app/api/hub/` and `app/api/infra-pr/` — the action + PR routes.

Then provide your **host config** (see §5) and mount the shell.

## 3. Database

Run the migration in your Supabase project:

```
supabase/migrations/20260616_pending_infrastructure_prs.sql
```

It is idempotent and self-healing. Confirm afterward that
`infrastructure_prs` exists with the `fingerprint` column and the
`infrastructure_prs_open_fingerprint_uidx` index.

If you use the SQL Editor / project picker, also ensure the gated
`hub_exec_sql` function is installed (see `lib/hub/db-bootstrap-sql.ts`).

## 4. Environment variables

See `buyer-env-vars.md`. At minimum set the **Core** group. Add provider keys
only for the providers you intend to use; each provider's actions stay inert
until its key is present.

## 5. Host config (the seam)

The console shell renders branding, pages, panels, and the provider catalog
from a `ConsoleHostUI` object — it does **not** import your app pages directly.

- Implement a `ConsoleHostUI` (see `console-host/consoleHostConfig.tsx` for the
  reference implementation: branding, `panelRouter`, `utilityPages`, `catalog`).
- Mount the console and inject your config:

```tsx
import CommandConsole from '@/components/hub/console/CommandConsole'
import { myConsoleUI } from '@/console-host/myConsoleConfig'

export default function ConsoleShell({ lang = 'en', initialTier = 'core' }) {
  return <CommandConsole lang={lang} initialTier={initialTier} hostUI={myConsoleUI} />
}
```

`CommandConsole` carries no host-specific import; swapping `hostUI` rebrands and
re-pages the console without touching the shell.

### Auth adapter

The hub resolves the current user + role via the verified Supabase session and a
`hub_workspace_users` row (see `lib/auth/permission-middleware.ts`). To plug in a
different identity source, replace that resolver so it returns
`{ id, email, role }` where `role ∈ owner | admin | operator | viewer | custom`.
The PR and action routes depend only on that contract.

### Provider adapter

A provider action is an `ActionExecutor` registered with `registerExecutor`
(see any file under `console-core/executors/`). To add a provider: register its
executors, add its templates to `lib/hub/provider-templates*`, and list it in
`lib/hub/console-catalog.ts`. Mark unfinished actions in `INCOMPLETE_ACTION_IDS`
so they are hidden in the UI and refused server-side.

### White-label branding

`ConsoleHostUI.branding` carries `productName`, `accent`, and `secondary`. The
shell currently uses fixed accent colors in places; wiring `branding` through is
a small, optional follow-up if you need full theme control.

## 6. Verify

- `npm run build` (or your CI) — compile clean.
- `npm test` — includes the redaction suite (`tests/prRedact.node.test.ts`).
- Smoke test: open the console, confirm the provider cards render, stage a PR,
  and confirm only an owner can merge a high-risk PR.
