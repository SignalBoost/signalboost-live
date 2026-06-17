# infra-pr — portable infrastructure PR approval module

A self-contained PR-style approval queue for AI-drafted infrastructure
changes. The AI drafts a change as a pending "PR"; a human merges it; on
merge the payload runs live through the host's action engine and (optionally)
triggers a production redeploy.

## What's in the folder (portable core)

```
lib/infra-pr/
  migration.sql            run once per project (owns its own table)
  types.ts                 shared types
  action-policy.ts         provider-agnostic risk classifier (zero deps)
  client.ts                only DB adapter — env vars only
  store.ts                 CRUD + audit
  execute.ts               execution seam (-> /api/hub/action by default)
  redeploy.ts              Vercel production redeploy
  merge.ts                 merge orchestration
  router.ts                packages any write into a generic InfrastructurePR
  tool.ts                  Chief of Staff tool
  ui/InfrastructurePage.tsx the approval cockpit
```

Internal imports are all relative (`./store`, `./types`...), so the folder
moves as a unit without depending on a path alias.

## Framework bindings (must live under app/ — Next.js requirement)

Route handlers and pages cannot live in a lib folder, so these 4 thin files
import from the module and do nothing else:

```
app/api/infra-pr/route.ts
app/api/infra-pr/[id]/route.ts
app/api/infra-pr/[id]/merge/route.ts
app/dashboard/infrastructure/page.tsx   (one-line re-export of the UI)
```

## Port to a fresh project (out of the box)

1. Copy `lib/infra-pr/` into the new project.
2. Add the 4 `app/` shim files above.
3. Run `lib/infra-pr/migration.sql` in the project's database.
4. Set env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — queue storage
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — auth in the app shims
   - `VERCEL_DEPLOY_HOOK_URL` — (optional) auto-redeploy on merge
   - `INFRA_PR_ENGINE_PATH` — (optional) override the default `/api/hub/action`
5. Register the COS tool: import `proposeInfrastructurePrTool` +
   `proposeInfrastructurePr` from `@/lib/infra-pr/tool` into your assistant's
   tool list and dispatch.

## Seams (the only two things to repoint when porting)

- **Execution:** `execute.ts` posts the stored payload to the host engine.
  Change `INFRA_PR_ENGINE_PATH` (env) or `ENGINE_PATH` in that file.
- **Auth:** lives in the 4 app shims (Supabase SSR). Swap for the host's auth
  if different — the module core never reads auth directly.

## Risk model (provider-agnostic)

`action-policy.ts` classifies by action type, never by provider:
- verb default: read=low, create/update=medium, delete=high
- explicit high-risk action IDs (drop_table, delete_branch, create_payout,
  rotate_keys, delete_user, empty_bucket, ...) override to high
- tier: high => needs_approval (second confirm); low/medium + elevated =>
  auto_confirm (one-click merge)
