# Reconcile externally merged Builder repairs

Live canary job `938903c9-51c0-48b9-903b-ddd344c24e83` reproduced a failing
regression, changed only its implementation, passed the unchanged proof, and opened
PR #4701. GitHub subsequently recorded the PR merged into its canary branch,
but Builder remained paused with `repository_merge_pending=true` and `merge_taken=false`.

The merge worker only scanned open PRs bearing a mutable body marker. Once merged
outside that worker, a PR disappeared from discovery and could not reach the job
completion callback. The same risk applies if the worker merges but loses its
response before updating the job.

The cron now independently scans server-persisted paused repair identities and
reads each specific GitHub PR. Reconciliation requires matching PR number, base
branch, exact repair head, canonical repositories, merged/closed flags and a valid
merge SHA. It issues no merge requests and does not infer prior CI success.
An edited PR body cannot erase a job's reconciliation identity. Missing or
mismatched evidence remains pending; errors permit a later retry. Existing job
claim-generation and paused-status fences preserve idempotent terminalization.

Main repairs still require their saved rollback checkpoint and the existing durable
deployment/live-acceptance path. A GitHub merge or READY deployment alone cannot
complete a production job. Observed external merges are described as observed on
GitHub, not as independently proven governed-gate passes.

Five behavioral tests cover the live failure shape, mismatched/open/fork PRs,
production checkpoint/acceptance separation, transient errors, retry/idempotence,
absent credentials, deadlines and bounded work. Seventeen reconciliation and
repository repair tests pass locally. The regression suite is a Vercel release gate.
Production recovery of the paused canary remains a separate post-deployment check.
