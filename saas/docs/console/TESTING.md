# Console Hub & PR Cockpit — Testing

## What runs today

`npm test` runs Node's built-in test runner over the `*.node.test.ts` suites,
including:

- **`tests/prRedact.node.test.ts`** — the security-critical payload redaction
  for the PR Cockpit. 11 cases covering sensitive-key masking, value-field
  masking, deep/array redaction, recognizability hints, input immutability, and
  PR/PR-list shape redaction. This pins the guarantee that staged secrets never
  reach the browser or logs.

These are pure-function tests: no database, no network, deterministic.

## What still needs an integration / alias-aware harness

The PR engine (`lib/hub/pr-engine.ts`) and the route files import via the `@/`
path alias and (for stage/merge) talk to Supabase. Node's built-in runner does
not resolve `@/`, so the cases below need either **vitest** (configured with the
tsconfig path alias) or an **integration harness** with a disposable Supabase
test project. Recommended cases to add when that harness exists:

PR engine:
- stages a valid PR (`open`, correct fields)
- rejects an unknown `templateId` with a helpful "valid templates" hint
- deduplicates an identical open PR (same fingerprint) → returns the existing PR
- `merge` atomically locks `open → merging` (a second concurrent merge is refused)
- stops on the first failing step and lands `failed` with the error
- `resolveActionRoute` sends engine providers to `/api/hub/action/engine` and
  everything else to `/api/hub/action`

RBAC (route layer):
- unauthenticated request → 401
- operator can view/stage but cannot close
- admin cannot merge a high-risk PR (owner-only)
- owner can merge any risk

Console core:
- validates required fields
- blocks unknown actions (auto-blocked by policy)
- blocks unauthenticated users
- enforces admin/owner policy on writes
- never logs raw secret values

## Suggested next step

Add `vitest` + a `vitest.config.ts` that maps `@/*` to the project root, then
port the cases above. The redaction suite can stay on the Node runner or move to
vitest alongside the rest — either is fine.
