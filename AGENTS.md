<!-- AGENTS.md -->
# AGENTS.md — Mandatory entry point for every AI agent

STOP. Before diagnosing, changing, reviewing, or reporting anything in this repository, read the root `ONBOARD.md` in full and inspect the current repository state. `AGENTS.md` is an enforcement pointer; it is not a second capability snapshot and must not replace current code/runtime evidence.

## Required working order

1. Read the current root `ONBOARD.md` in full.
2. Check the exact current `main`, the task branch/PR, and concurrent work that could affect the task.
3. Follow the task-specific current-state/handoff references named by `ONBOARD.md` when relevant.
4. Read the exact implementation, tests, migrations, workflows, and documentation related to the task.
5. Verify runtime/production state from live evidence when the task or claim depends on it.
6. Do not ask the owner for information that the repository, documentation, telemetry, configuration, or live evidence can answer.
7. Do not code, diagnose, report status, or claim completion from memory alone.
8. Re-scan current state after interruptions, before consequential changes, before final status claims, and before merge because other developers/agents may land concurrent work.
9. Finish authorized work end-to-end: implementation, tests, follow-on repair, deployment/runtime verification when applicable, and documentation reconciliation.
10. Stop for human approval when a consequential action reaches the platform's approval boundary; never bypass a deterministic governance gate.

## Pull-request attestation

Before a pull request may be considered merge-ready, its body must contain the exact current acknowledgements required by `.github/workflows/onboard-enforcement.yml`:

```text
ONBOARD_ACK_BLOB: <git-blob-id-of-current-ONBOARD.md>
REPO_SCAN_HEAD: <exact-current-PR-head-sha>
```

Any new commit makes the `REPO_SCAN_HEAD` acknowledgement stale. Any change to `ONBOARD.md` changes its Git blob identity and makes the `ONBOARD_ACK_BLOB` acknowledgement stale. Re-read/reconcile and re-scan before updating the attestations.

## Source-of-truth rule

`ONBOARD.md`, implementation, tests, migrations, live runtime evidence, and current Git state are complementary evidence. If they disagree, investigate and reconcile the discrepancy. Never preserve a stale statement merely because it appears in documentation, and never treat a green build as proof of runtime capability.
