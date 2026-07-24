# AI Code Repair V1 controlled application engine

`lib/code-repair/application.ts` is the dry-run execution boundary for an already approved repair. It verifies, in order: proposal fingerprint, approval-token binding, validation report, independent reviewer approval, disposable-workspace integrity, and patch integrity. Every rejection is fail-closed and emits a structured rejected report.

The hard-coded `CODE_REPAIR_REPOSITORY_MUTATION_ENABLED` flag is `false`. The engine has no production repository path, Git commit/push/merge capability, pull-request capability, or live-application mode. It only stages the exact approved diff in a manager-supplied disposable workspace, prepares a rollback descriptor, then destroys that workspace in `finally`.

Callers supply a `CodeRepairDisposableWorkspaceManager`; production repository implementations are forbidden by the `productionRepository: false` contract and runtime integrity check. Audit sinks and metrics collectors receive only execution identifiers, safe lifecycle events, and counters. Approval verification consumes the approval token once, preventing replay.
