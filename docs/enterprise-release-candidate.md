# Enterprise Release Candidate Acceptance

> Read `ONBOARD.md` first. Marketing & Sales current-state handoff: `docs/marketing-sales-current-state.md`.

SignalBoost is Release Candidate only when required evidence exists and every required gate passes. A green deployment, complete architecture, unit tests, or a high completion estimate is necessary context but is **not** sufficient evidence by itself.

## Marketing & Sales status

As of 2026-08-12, the core Marketing & Sales architecture is built: COS-first reasoning/fallback, Business Intelligence Corpus workflow, Enterprise Memory/Knowledge Graph/learning integration, Prospect Intelligence, Communication Hub, CRM production paths, Revenue Intelligence, Universal Adapter/provider-neutral integration, approval gates and campaign/outreach execution layers.

That means **core product construction and RC acceptance are separate questions**:

- Core Marketing & Sales software: architecture/product-code complete.
- Enterprise RC: true only after real target-environment evidence passes all required gates.
- Corpus population to 5,000 companies is operational data growth, not an RC architecture blocker by itself.

The canonical Marketing & Sales RC profile is `saas/lib/release-candidate/marketing-sales.ts`, exported through `saas/lib/release-candidate/index.ts`.

## Required gates

The Marketing & Sales RC profile requires all of the following to pass with recorded evidence:

1. **Deployment** — production build starts and serves the required Marketing & Sales surfaces.
2. **Multi-tenant isolation** — cross-tenant probes are blocked with zero leaked fields/data.
3. **Security** — authorization, secret handling, dependency/security checks, approval gates and tenant-isolation controls have no unresolved critical/high blocker.
4. **Resilience** — backup, restore and declared recovery behavior are verified within the applicable RPO/RTO.
5. **Performance** — sustained load/soak evidence meets declared tenant, latency, error-rate and duration thresholds.
6. **Observability** — telemetry, alerts, traces, operational dashboards and audit sink meet the declared coverage threshold.
7. **Integration** — the configured enterprise flow is verified across COS/EAE, Prospect, Business Intelligence Corpus, Communication, CRM, Revenue, Enterprise Memory and Universal Adapter boundaries.
8. **Documentation** — ONBOARD, Marketing & Sales, corpus, RC, operator and handoff docs match the current repository.

The generic `saas/lib/release-candidate/` evaluators remain the deterministic evidence evaluators for security, isolation, recovery, load/performance, observability and aggregate readiness.

## Fail-closed evidence policy

The Marketing & Sales profile deliberately defaults every missing requirement to `not_run`.

- No evidence → `not_run`, never pass.
- A gate explicitly marked `pass` with zero evidence is rejected by the evaluator.
- Evidence dated after the readiness snapshot is rejected.
- Required warning → not Release Candidate.
- Required failure → not Release Candidate.
- All required gates must be `pass` and carry real evidence for `releaseCandidate === true`.

Do not manufacture operational evidence from source inspection. Architecture can prove that a control exists; it cannot prove that a production exercise ran successfully.

## Evidence coverage

Use `getMarketingSalesRcEvidenceCoverage()` to report the evidence gap without guessing. It returns the number of required gates, supplied gates, gates that pass with evidence, missing gate IDs and supplied-but-non-passing gate IDs. This is the preferred way to turn an informal completion estimate into a concrete RC punch list.

## Evidence rules

Every evidence item must carry a non-empty reference and a valid observation timestamp that is not later than the generated readiness snapshot. Suitable evidence kinds include tests, deployment records, runbooks with recorded execution, reports, metrics and manual/operational evidence where the gate requires it.

For integrations, prove the boundary actually used in the target environment. A catalog descriptor or optional connector that is not configured for that buyer does not need to be falsely exercised, but any connector claimed as part of the accepted production configuration must have real evidence.

## Release policy

1. Record evidence from the real target environment.
2. Evaluate it with `evaluateMarketingSalesReleaseCandidate()` / the applicable RC evaluators.
3. Inspect `getMarketingSalesRcEvidenceCoverage()` for the remaining proof gap.
4. Resolve every failed, warning or not-run required gate.
5. Repeat the affected exercise after remediation.
6. Mark Marketing & Sales enterprise RC only when the deterministic snapshot returns `releaseCandidate === true`.

## Developer handoff

Do not reopen completed COS-first or Business Intelligence Corpus architecture merely because the 5,000-company corpus is still growing. Treat new engineering as justified only by a failed RC gate, demonstrated regression, measured cost/quality improvement, or new requirement.

See:

- `docs/marketing-sales-current-state.md`
- `docs/business-intelligence-corpus.md`
- `saas/lib/release-candidate/marketing-sales.ts`
- `saas/tests/marketingSalesReleaseCandidate.node.test.ts`
