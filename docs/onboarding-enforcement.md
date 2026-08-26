# ONBOARD.md enforcement and branch protection

`ONBOARD.md` is the canonical repository onboarding/current-state reference. Reading it and scanning the current repository are mandatory preconditions for developers and AI agents before they diagnose, change, or report platform behavior.

Documentation alone is not considered enforcement. The repository therefore carries a machine-verifiable pull-request acknowledgement check in `.github/workflows/onboard-enforcement.yml`.

## Pull-request acknowledgement contract

Every pull request must contain two exact lines in its body:

```text
ONBOARD_ACK_BLOB: <git-blob-id-of-the-ONBOARD.md-at-the-PR-head>
REPO_SCAN_HEAD: <exact-PR-head-commit-sha>
```

The `Onboarding Enforcement / Require current ONBOARD and repo scan acknowledgement` job fails when either value is missing or stale.

This design intentionally makes acknowledgements version-specific:

- if `ONBOARD.md` changes, its Git blob identity changes and the old acknowledgement no longer passes;
- if another commit is pushed to the PR, the old repository-scan acknowledgement no longer passes;
- the contributor must re-read/reconcile the current onboarding state and re-scan the exact head before the check becomes green again.

No automated check can prove a human or model cognitively understood every line. The exact-content and exact-head acknowledgements are therefore an attestation boundary, while code review, tests, live verification, and owner review provide independent evidence.

## Required branch protection for `main`

The acknowledgement job becomes non-bypassable only when GitHub protects `main`. Configure `main` with all of the following:

1. **Require a pull request before merging**.
2. **Require approvals** with at least `1` approval.
3. **Require review from Code Owners**.
4. **Dismiss stale pull request approvals when new commits are pushed**.
5. **Require status checks to pass before merging**.
6. Add **`Require current ONBOARD and repo scan acknowledgement`** as a required status check.
7. **Require branches to be up to date before merging**.
8. **Restrict direct pushes** to the repository owner/emergency administrators only.
9. **Do not allow bypassing the above settings** when available.

If `main` is unprotected, this policy is not fully enforced even if the Action exists. Treat an unprotected `main` as a governance defect.

## Agent entry point

`AGENTS.md` is the mandatory discovery pointer for AI coding agents. It must stay short and current: it points agents to `ONBOARD.md`, current repository state, task-specific files, runtime evidence, and the acknowledgement gate. It must not become a second stale capability snapshot.

## Concurrent-work rule

Before starting, after an interruption, before a consequential change, and before final merge/status claims, re-check current repository state because other developers or agents may have landed concurrent work. Never ask the owner for information that can be resolved from the repository, current documentation, telemetry, or live evidence.
