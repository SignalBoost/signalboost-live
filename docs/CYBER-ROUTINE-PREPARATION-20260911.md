# Cybersecurity routine preparation and approval queues

Date: 2026-09-11

Owner request: remove blanket approval requirements for routine dependency preparation and stop displaying completed Guardian reviews as pending human approvals.

## Changes

The dependency request endpoint uses the authenticated owner's stored scan, not a browser-supplied report. Routine plans are recorded as in progress with human_approval_required=false, human_approved=false and no invented approval identity. A compare-and-set worker claims queued work and verifies canonical scan ownership, exact repository scope, freshness, stable compatible fixed versions, direct manifest paths and current isolated-branch contents. Unknown or conflicting evidence creates a visible verification blocker, not an approval demand. Branch proposals are not verified repairs; lockfile regeneration, tests and release checks remain outstanding.

The dashboard uses one partition for the pending count and queue, places active work separately, and retains completed/closed records in collapsed history. Shared English, Spanish, Portuguese, Polish and Russian wording explains autonomy and its boundaries. The PDF export uses the same policy wording. Historical evidence and genuine approval records are not rewritten.

## Boundaries

No merge, deployment, containment, arbitrary repository write, Guardian repair or Stranger testing authority is added. Existing authentication, repository writer isolation and Guardian disposition RPC boundaries remain. No database migration is required. This repair does not fix unrelated COS/Gemini diagnostic failures or abandoned Guardian jobs.

## Validation

The first 12-test regression run reproduced five failures against the exact original dependency route and dashboard. The original focused suite had 18 passing tests, including execution of the real dependency, proposal and PDF route modules with injected host ports. The existing cybersecurityLiveProgress registration imports this suite; its original tests remain intact. Uploaded source blob hashes match the tested partial local assembly. This is not a complete local checkout, full typecheck, full repository CI or authenticated Production acceptance. Current-head CI and Preview must pass before merge, followed by exact-commit Production deployment verification.

## PR #2139 acceptance repair

The original worker could claim a legacy approval-gated row and clear its approval requirement even on verification failure. Candidate selection now permits only explicitly approval-free work or a recorded approved request with both human and fix-plan approval. It filters before selecting the next row, rejects inconsistent returned metadata, and rechecks the authorization lane inside the compare-and-set claim. Execution outcomes never rewrite approval requirements, votes, identities or timestamps. A changed owner, source, repository, request status or approval before the claim prevents repository work.

Eight new executable regressions all failed on the exact original worker blob 720e4fd876d68fc8e5df1a56229cd74ec3ae13c9 and all pass on the repaired worker. They cover admin/cron legacy requests, missing and partial approval metadata, stale query results, queue fairness, routine proposals, preservation on success/failure, and approval-revocation races. The existing suite registers the new tests, represents routine fixtures with the real host-owned state, and forbids outcome writes to approval fields.

The integration preserves current main 1784f0975acf72c4c383ac1cb67ebe68e18d4748, including its exact language-runner blob 4ea47e7610f1a3ee92e8058937848c37d7a3a93f. That independent main update passed Vercel and resolves the earlier missing-executor build blocker. No University test or executor gate is weakened by this repair. Exact repaired-head CI and Preview remain required; this document does not claim merge or Production acceptance.
