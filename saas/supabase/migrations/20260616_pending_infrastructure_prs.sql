# PR-style infrastructure approval queue — wiring

The merge step **replays the stored payload through your existing
`/api/hub/action` engine**, forwarding your session cookie. So every executor
you already wired (Vercel, Supabase, GitHub, Stripe, ...) runs unchanged. The
queue does not re-implement any provider call. Only the redeploy is owned here.

## Files (paths are final, drop-in)

```
supabase/migrations/20260616_pending_infrastructure_prs.sql   # table + audit + RLS
lib/infra-pr/client.ts        # service-role client
lib/infra-pr/store.ts         # CRUD + audit
lib/infra-pr/redeploy.ts      # Vercel production redeploy
lib/infra-pr/execute.ts       # THE SEAM -> /api/hub/action
lib/infra-pr/merge.ts         # merge orchestration
app/api/infra-pr/route.ts            # GET list / POST create
app/api/infra-pr/[id]/route.ts       # GET one / DELETE close
app/api/infra-pr/[id]/merge/route.ts # POST merge (approval gate)
lib/ai/tools/infraPr.ts       # Chief of Staff tool: proposeInfrastructurePr
app/dashboard/infrastructure/page.tsx # Open Pull Requests UI
```

## 5 wiring steps

1. **Run the migration** in the SaaS canonical project (`qpblefwtnbivuusxmabv`).

2. **Verify one import.** The 3 API routes import `getCurrentUser` from
   `@/lib/auth`. If your hardened routes import it from a different module,
   change that one line in each route. They expect `user.id`.

3. **Register the AI tool.** In your Chief of Staff tool registry, add
   `proposeInfrastructurePrTool` to the tool list and route the call to
   `proposeInfrastructurePr(args, { userId })`. Then add one line to the COS
   system prompt: *"For any action that writes to a provider (Vercel env,
   Supabase, GitHub, Stripe, etc.), call `proposeInfrastructurePr` to draft a
   pending PR — never execute provider writes directly."*

4. **Add the redeploy env var** in Vercel: `VERCEL_DEPLOY_HOOK_URL`
   (Project → Settings → Git → Deploy Hooks → create one for `production`).
   Without it, merge still runs the action; it just skips the auto-redeploy
   and records `redeploy: { triggered:false, error: ... }`. Fallback path uses
   `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` if you prefer the API over a hook.

5. **Add a nav link** to `/dashboard/infrastructure` (Admin menu).

## Flow

1. You instruct the COS → it fills the exact `/api/hub/action` payload and calls
   `proposeInfrastructurePr` → row inserted as `open`. Nothing fires.
2. `/dashboard/infrastructure` lists open PRs with payload + diff preview.
3. You click **Merge / Approve** → `POST /api/infra-pr/[id]/merge` →
   forwards your cookie → engine runs the live action → if `triggers_redeploy`,
   production redeploy fires → row → `merged`, result + audit recorded.
4. Failures land as `failed` with the engine's error surfaced on the card. No
   silent dead-ends; every transition is written to `infrastructure_pr_audit`.

## Env vars used
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (SaaS canonical) — already set
- `VERCEL_DEPLOY_HOOK_URL` — new, for auto-redeploy on merge
