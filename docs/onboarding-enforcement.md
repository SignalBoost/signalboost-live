# ONBOARD.md guidance and branch protection

`ONBOARD.md` remains the repository onboarding reference. Contributors should read it
before working and update it when a change affects documented platform behavior,
architecture, or operating guidance. These are documentation expectations, not merge
conditions.

## Merge policy

No GitHub Action, local Git hook, pull-request template requirement, or branch-protection
status check requires an `ONBOARD.md` update or acknowledgement. A branch may merge
without changing `ONBOARD.md` and without a PR-body acknowledgement.

## Branch protection settings for `main`

Retain governance protections unrelated to onboarding documentation:

1. **Branch name pattern:** `main`.
2. Enable **Require a pull request before merging**.
3. Enable **Require approvals** and set the approval count to at least `1`.
4. Enable **Require review from Code Owners**.
5. Enable **Dismiss stale pull request approvals when new commits are pushed**.
6. Enable **Require status checks to pass before merging**, but do not require the
   removed `Require ONBOARD.md Acknowledgement` or `Critical files require ONBOARD.md
   update or no-change statement` checks.
7. Enable **Require branches to be up to date before merging**.
8. Enable **Restrict who can push to matching branches** and limit direct push access
   to the repository owner or emergency administrators.
9. Enable **Do not allow bypassing the above settings** when available.

## Owner review for sensitive paths

`.github/CODEOWNERS` continues to identify sensitive paths for owner review when branch
protection enables **Require review from Code Owners**. This review control is independent
of `ONBOARD.md` documentation and remains in place.
