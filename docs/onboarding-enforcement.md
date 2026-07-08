# ONBOARD.md enforcement and branch protection

This repository enforces `ONBOARD.md` with PR templates, required GitHub Actions checks, CODEOWNERS, and branch protection. GitHub cannot stop someone from reading another file locally before `ONBOARD.md`, so merge protection is the operational control.

## Required PR body acknowledgement

Every pull request must include this exact line:

```text
ONBOARD.md read before repo scan: YES
```

The default pull request template includes the line. The required status check is stable as:

```text
Require ONBOARD.md Acknowledgement / onboarding-acknowledgement
```

## Critical-file maintenance rule

A second required workflow checks ONBOARD-sensitive paths. If a pull request changes COSA, video pipeline, provider templates, Vercel env handling, Supabase, storage buckets, audit, cybersecurity, infrastructure, workflow, approval-gate, secret/vault, or other onboarding-sensitive files, then the PR must do one of the following:

1. Update `ONBOARD.md` in the same PR, or
2. Include this exact PR-body statement when the change is only mechanical/refactor-only and does not change onboarding behavior:

```text
No onboarding behavior change; mechanical/refactor-only update.
```

## Exact GitHub branch protection settings for `main`

In GitHub, open **Settings → Branches → Branch protection rules → Add branch ruleset** or edit the existing rule for `main`, then enable these settings:

1. **Branch name pattern:** `main`.
2. Enable **Require a pull request before merging**.
3. Enable **Require approvals** and set the approval count to at least `1`.
4. Enable **Require review from Code Owners**. This makes `CODEOWNERS` require owner review for critical paths.
5. Enable **Dismiss stale pull request approvals when new commits are pushed**.
6. Enable **Require status checks to pass before merging**.
7. Enable **Require branches to be up to date before merging**.
8. Add this required status check exactly: `Require ONBOARD.md Acknowledgement`.
9. Add this required status check for critical-file enforcement: `Critical files require ONBOARD.md update or no-change statement`.
10. Enable **Restrict who can push to matching branches** and leave direct push access empty or limited to the repository owner/emergency admins only. This blocks direct pushes to `main` for developers.
11. Enable **Do not allow bypassing the above settings** if available for the repository plan.
12. Save the rule.

## Owner review for critical paths

`.github/CODEOWNERS` marks ONBOARD, workflows, COSA/COS, video, provider templates, Vercel/env/vault/secrets/infra, Supabase/storage buckets, audit, cybersecurity, and approval-gate paths as owned by the repository owner. Branch protection must enable **Require review from Code Owners** for this to block merges until the owner reviews critical-path PRs.

## How to test enforcement

1. Open a test branch from `main`.
2. Make a harmless documentation change.
3. Open a pull request and delete this line from the body: `ONBOARD.md read before repo scan: YES`.
4. Confirm the `Require ONBOARD.md Acknowledgement / onboarding-acknowledgement` check fails.
5. Add the exact acknowledgement line back to the PR body and confirm the check passes.
6. Change a critical file such as `.github/workflows/onboard-check.yml` without changing `ONBOARD.md` and without adding the mechanical/refactor-only sentence.
7. Confirm the critical-file check fails.
8. Add either an `ONBOARD.md` update or the exact sentence `No onboarding behavior change; mechanical/refactor-only update.` and confirm the critical-file check passes.
