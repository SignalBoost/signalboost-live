# CLAUDE.md

MANDATORY: before scanning, diagnosing, or changing anything in this repository, read `ONBOARD.md` (full onboarding) and `AGENTS.md` (capability card and agent rules) at the repository root, in that order. Then scan the repo, then read the task-specific files, then act. Never work from memory alone — the current repository is the source of truth.

For Marketing & Sales work, also read `docs/marketing-sales-current-state.md`, `saas/docs/marketing-sales-module-design.md`, `docs/business-intelligence-corpus.md`, and `docs/enterprise-release-candidate.md` before using older status estimates or build sequences. The core Marketing & Sales architecture is built; enterprise Release Candidate status remains evidence-based and must not be inferred from architecture or a green deployment. The Business Intelligence Corpus workflow is complete while population toward 5,000 companies continues as operational data growth.

Key constraints (details in ONBOARD.md / AGENTS.md):
- Prefer coherent batches of related changes so CI/Vercel do not redeploy for every tiny edit.
- 5-language i18n (en, pt, es, pl, ru) for every user-facing string.
- BYOK model: user flows run on the user's own provider keys, never platform keys; keys are encrypted, never logged.
- Owner approval gates on all dispatch/publish/spend/infrastructure actions are never skipped.
- Never claim descriptor-only integrations are production-live merely because they appear in a catalog.
- Never mark Marketing & Sales enterprise RC complete without real passing evidence for every required gate.
- Keep ONBOARD.md and current-state docs useful as durable handoff material, but documentation never replaces current repo inspection.
