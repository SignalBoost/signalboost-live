# CLAUDE.md

MANDATORY: before scanning, diagnosing, or changing anything in this repository, read `ONBOARD.md` (full current onboarding) and `AGENTS.md` (capability card and agent rules) at the repository root, in that order. Then read `docs/HANDOFF-2026-08-13.md` for the current dated takeover state. For COS active-learning work also read `docs/HANDOFF-COS-ACTIVE-LEARNING-2026-08-13.md`; for Self-Healing work read `docs/portables/self-healing-monitoring-current-state-20260813.md`. Then scan current `main`, read the task-specific files, and act. Never work from memory alone — the current repository and live evidence are the source of truth.

For Marketing & Sales work, also read `docs/marketing-sales-current-state.md`, `saas/docs/marketing-sales-module-design.md`, `docs/business-intelligence-corpus.md`, and `docs/enterprise-release-candidate.md` before using older status estimates or build sequences. The core Marketing & Sales architecture is built; enterprise Release Candidate status remains evidence-based and must not be inferred from architecture or a green deployment. The Business Intelligence Corpus workflow is complete while population toward 5,000 companies continues as operational data growth.

Current COS/Self-Healing facts that are easy to misreport:
- The live development reasoner remains `qwen2.5-coder:32b`. `qwen3:30b` is the intended durable default in code but is not yet verified live on the existing RunPod pod.
- Gemini/external models are replaceable fallback/teacher resources, not COS identity or automatic factual authorities.
- COS has an explicit cognitive lifecycle and durable active-learning loop. Only `validated`, `learned`, or `mastered` procedural skills may enter live reasoning.
- The first validated skill (`diagnose-tenant-specific-tail-latency`) passed 2/2 practice and 3/3 distinct holdouts; this is one validated capability, not proof that COS has reached the 85% independent-pass target.
- Procedural `[SK#]` citations are separate from factual evidence and must not inflate factual confidence.
- Native proactive Self-Healing monitoring is production-runtime-verified. PR #1159 connects native incidents to bounded connector evidence, COS-first diagnosis and existing Agent Gateway/MCP governance without adding mutation authority. A controlled real anomalous end-to-end acceptance trace is still desirable before claiming repeated full remediation runtime proof.
- Enterprise BYOM/BYOA is a release requirement: buyers do not have to use Qwen or RunPod, and COS memory/skills/provenance must survive model/provider swaps.

Key constraints (details in ONBOARD.md / AGENTS.md):
- Prefer coherent batches of related changes so CI/Vercel do not redeploy for every tiny edit.
- 5-language i18n (en, pt, es, pl, ru) for every user-facing string.
- BYOK model: user flows run on the user's own provider keys, never platform keys; keys are encrypted, never logged.
- Owner approval gates on all dispatch/publish/spend/infrastructure/consequential actions are never skipped.
- Never claim descriptor-only integrations are production-live merely because they appear in a catalog.
- Never mark Marketing & Sales enterprise RC complete without real passing evidence for every required gate.
- Never expose `/workspace/cos-api-key`, provider secrets or cron secrets.
- Never call retrieval/injection "use" without cited/observable evidence.
- Never call teacher output trusted truth, locally generated practice an independent holdout, or a validated procedural skill factual evidence.
- Never claim Qwen3 is live until runtime/provenance proves it.
- Re-check current `main` after concurrent work before editing or merging.
- Keep ONBOARD.md and current-state docs useful as durable handoff material, but documentation never replaces current repo/runtime inspection.