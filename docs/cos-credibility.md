# COS credibility and confidence calibration

COS confidence is intended to become an estimated probability of correctness, not a quality score and not an escalation knob.

## What is measured

`lib/ai/cos/credibility.ts` computes objective reliability metrics from predictions paired with resolved outcomes:

- accuracy and mean predicted confidence;
- Brier score and log loss;
- expected and maximum calibration error;
- signed confidence bias (positive means overconfident);
- answer coverage, selective accuracy, appropriate abstention and false abstention;
- provenance truthfulness;
- action correctness when action-simulator outcomes are available;
- robustness consistency across equivalent prompt variants.

The module also implements pool-adjacent-violators isotonic calibration. It learns a monotonic mapping from raw confidence to observed correctness. It does not add hand-authored evidence bonuses.

## Safety rule

A fitted calibration curve must **not** be used on the same observations that trained it. Smoke-suite data is only a pipeline check. Live COS confidence may be recalibrated only after the mapping is trained on a sufficiently large calibration set and validated on a disjoint holdout set. Runtime authorization thresholds remain separate policy.

## Storage

Migration `20260813_cos_credibility_benchmark.sql` creates owner/service-only benchmark cases, runs, and observations. Each observation keeps the raw confidence, correctness, abstention result, provenance truthfulness, optional action correctness, robustness grouping, response source, reasoner label, evaluator details, and latency.

## Owner endpoint

`/api/admin/cos-credibility` is owner-only.

- `GET` returns the reliability report and empirical calibration map for a suite or run.
- `POST` runs a bounded local-COS smoke batch (maximum 10 cases). `tryCOSFirstAnswer` does not invoke an external fallback; a COS escalation is recorded as an abstention/failure to answer, not silently replaced with an external-model answer.

The seeded `cos-credibility-smoke-v1` suite is deliberately small and deterministic. It verifies the measurement pipeline and includes equivalent-prompt robustness and unanswerable-question cases. It is **not** a credibility certification suite.

## Certification path

Before live calibration is enabled, expand to hundreds/thousands of held-out cases across supported domains, add resolved real-world outcomes, adversarial/contaminated-evidence cases, and a governed action simulator. Split by time and case family so variants of the same question cannot leak across train and holdout sets. Report calibration by domain and risk class, not only globally.
