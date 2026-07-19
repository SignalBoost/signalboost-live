# CLAUDE.md

MANDATORY: before scanning, diagnosing, or changing anything in this repository, read `ONBOARD.md` (full onboarding) and `AGENTS.md` (capability card and agent rules) at the repository root, in that order. Then scan the repo, then read the task-specific files, then act. Never work from memory alone — the current repository is the source of truth.

Key constraints (details in ONBOARD.md / AGENTS.md):
- Owner is a non-coder using GitHub web only: deliver complete file replacements, never diffs; never require mid-task merges.
- 5-language i18n (en, pt, es, pl, ru) for every user-facing string.
- BYOK model: user flows run on the user's own provider keys, never platform keys; keys are encrypted, never logged.
- Owner approval gates on all dispatch/publish/spend/infrastructure actions are never skipped.
- Keep ONBOARD.md useful as durable documentation when appropriate, but an ONBOARD.md edit or PR-body acknowledgement is not required for commit or merge.
