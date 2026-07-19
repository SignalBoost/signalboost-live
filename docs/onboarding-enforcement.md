# ONBOARD.md guidance and branch protection

## Merge-gate status

As of 2026-07-19, `ONBOARD.md` is documentation and is not a merge prerequisite.

Pull requests no longer need to:

- change `ONBOARD.md`;
- include an `ONBOARD.md` acknowledgement in the PR body; or
- include a mechanical/refactor-only exception statement.

The former ONBOARD checks remain as pass-through GitHub Actions jobs with their original workflow and job names. Keeping the status contexts stable prevents existing branch-protection rules from waiting forever for a deleted check, while ensuring the checks always succeed without inspecting changed files or PR text.

The tracked local hooks also remain as compatibility no-ops. They do not modify, stage, or require `ONBOARD.md`, and they do not block commits.

## Branch protection that remains recommended

The ONBOARD retirement does not remove other governance controls. The `main` branch should continue to use the repository's normal protections, including:

1. Require a pull request before merging.
2. Require the repository's configured approvals and Code Owner review where applicable.
3. Dismiss stale approvals after new commits when configured.
4. Require the actual lint, typecheck, build, test, security, approval-boundary, and role-validation checks.
5. Require branches to be up to date when appropriate.
6. Restrict direct pushes to the intended maintainers.
7. Preserve emergency/bypass policy according to repository ownership rules.

The legacy status contexts may remain configured because they now report success. They can be removed from branch protection later as a separate repository-settings cleanup, but removing them is not required for branches to merge.

## Verification

To verify the retirement:

1. Open a pull request that does not modify `ONBOARD.md`.
2. Do not add any ONBOARD acknowledgement or exception sentence to the PR body.
3. Confirm both legacy ONBOARD workflows report success.
4. Confirm all unrelated required checks still run normally.
5. Confirm the pull request is mergeable once those unrelated required checks and reviews pass.
