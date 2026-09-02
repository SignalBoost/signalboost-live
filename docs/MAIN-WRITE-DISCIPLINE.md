# Main Write Discipline

Status: mandatory repository integration contract.

## Goal

Prevent parallel developers and AI agents from invalidating each other's verified work on `main`.

`main` is an integration boundary, not a work branch.

## Single-writer rule

- Developers and agents may inspect, edit, test, commit, and open PRs on their own task branches.
- Developers and agents must not commit, push, force-push, rebase-write, squash-write, or otherwise write directly to `main`.
- Agents do not self-merge. The repository owner or a separately designated main integrator is the single writer that advances `main` after approval and evidence review.
- Main integration uses a normal GitHub **merge commit**. Squash and rebase integration are intentionally rejected by the Main Write Discipline audit because they make concurrent-write provenance harder to police.

## Mandatory serialization token

Every PR whose base is `main` must modify `.github/main-write-token`.

The file must contain exactly the current PR base SHA and head branch on these two records:

```text
base_sha=<current PR base SHA>
branch=<current PR head branch>
```

The token is deliberately shared by every PR. If PR A and PR B were prepared from the same `main`, both change the same token. After PR A merges, PR B becomes stale/conflicting and must refresh from the new `main`, update the token, re-scan the repository, and rerun its proof before it can integrate.

This converts parallel agent work into serialized integration without preventing parallel branch development.

## Required sequence for every agent task

1. Read current `ONBOARD.md` and scan the repository before modifying anything.
2. Query the current `main` SHA.
3. Create or refresh a dedicated task branch from that exact `main`.
4. Make the change and run the required proof on the branch.
5. Update `.github/main-write-token` with that PR's current base SHA and branch name.
6. Open/update the PR with the exact `ONBOARD_ACK_BLOB` and `REPO_SCAN_HEAD` acknowledgements.
7. Do not merge the PR unless the owner explicitly authorizes merge.
8. Immediately before merge, re-query `main`. If it advanced since the PR was proven, refresh/reconcile the branch, update the token, re-scan, rerun proof, and refresh acknowledgements.
9. Integrate only one PR at a time using a GitHub merge commit.
10. After merge, verify the new `main` SHA and post-merge CI/deployment state before treating the change as accepted.

## Machine enforcement

`.github/workflows/main-write-discipline.yml` provides two controls:

- PR control: a PR targeting `main` fails unless it changed the shared token and the token names the current base SHA and head branch.
- Push audit: a new `main` head fails unless it is a two-parent merge commit, advances the shared token, and GitHub associates it with exactly one merged PR targeting `main`.

`Onboarding Enforcement` independently checks the same token on every PR to `main`, so stale agent branches cannot satisfy onboarding merely by carrying an old acknowledgement.

## GitHub repository setting still required for hard rejection

The workflow makes direct writes red and prevents compliant PRs from integrating stale state, but a workflow runs after Git receives a push. Hard server-side rejection of direct pushes requires GitHub branch protection or a repository ruleset on `main` with at least:

- require a pull request before merging;
- require status checks, including `Onboarding Enforcement` and `Main Write Discipline`;
- require branches to be up to date before merging;
- require CODEOWNERS review;
- block force pushes and deletion;
- do not allow ordinary actors or automation to bypass the rule.

Until that GitHub setting is enabled, a direct push can still land in the repository, but it will be immediately classified as a Main Write Discipline violation instead of silently appearing as an accepted integration.

## Emergency path

There is no agent emergency bypass. If the human owner deliberately makes an emergency direct `main` change, the push audit is expected to go red. The next controlled PR must reconcile that state and restore a green serialized integration baseline. Do not teach agents an override token or magic commit message that would let them manufacture their own bypass.
