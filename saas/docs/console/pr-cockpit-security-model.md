# PR Cockpit — Security Model

The PR Cockpit puts an approval gate in front of infrastructure changes.
Provider actions normally fire the instant they are submitted; the cockpit
instead stages the exact provider payloads as an **Open Pull Request**, lets an
authorized human review them, and executes only on an explicit **Merge**.

## Lifecycle

```
open ──► merging ──► merged
  │           └────► failed   (stops on first failing step)
  └────────────────► closed   (dismissed without running)
```

The transition `open → merging` is an **atomic, conditional update**: only one
click can win, so a PR can never double-fire. On merge, each step is replayed
**in order** through the existing `/api/hub/action` (and `/api/hub/action/engine`)
routes, forwarding the approver's session cookie — so every step still passes
the same permission, policy, and audit checks it always did. Execution stops at
the first failing step and the PR lands as `failed` with the error surfaced.

## Role-based access control

Authentication and role are resolved by the shared hub resolver (verified
Supabase session → `hub_workspace_users` role). There is no header-trust path
and no owner fallback. The API routes enforce:

| Action | Required role |
| --- | --- |
| View / list PRs | owner, admin, operator |
| Stage a PR | owner, admin, operator |
| Close a PR | owner, admin |
| Merge a **low / medium** risk PR | owner, admin |
| Merge a **high** risk PR | **owner only** |

Risk is read from the stored PR **before** any state change, so an admin cannot
escalate a high-risk merge.

## Secret redaction

Staged payloads can carry real secrets (API keys, tokens, env-var values). The
read-for-display paths (the `GET` routes) run every payload through
`lib/hub/pr-redact.ts` **before it leaves the server**:

- Keys matching `secret|token|password|credential|private|api_key|access_key|client_secret|service_role|bearer|auth_token|signing|webhook_secret` are masked.
- The value-bearing fields `value`, `secret`, `token`, `password` are masked by name.
- Redaction is deep (nested objects and arrays).
- Long values keep a 2-char head/tail hint (so an owner can recognize *which*
  credential it is) but never enough to use it; short values are fully masked.

The **merge** path reads the stored payload server-side and replays the real
values — it must never see redacted data, so redaction is display-only. Audit
entries record `{ prId, risk }` and never the payload. This is covered by
`tests/prRedact.node.test.ts`.

## Database & RLS

The migration `supabase/migrations/20260616_pending_infrastructure_prs.sql`
creates `infrastructure_prs` with:

- status/risk check constraints,
- a partial unique index on `fingerprint WHERE status = 'open'` (the dedup
  guarantee: at most one open PR per identical operation),
- an `updated_at` trigger,
- RLS **enabled** with deny-by-default policies: only `service_role` (the
  engine) can read/write; `anon` and `authenticated` are blocked at the table.
  All human access goes through the RBAC-gated API routes above.

The migration is idempotent and repairs older installs (it adds the
`fingerprint` column if missing).

## Threat notes

- A direct API call cannot bypass the UI: the routes enforce RBAC server-side,
  and incomplete/stub actions are refused with `501` before reaching an executor.
- Because merge forwards the approver's cookie, a step can never run with more
  privilege than the approver holds.
