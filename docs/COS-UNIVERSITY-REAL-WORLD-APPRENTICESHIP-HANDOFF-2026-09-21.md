# COS University Real-World Apprenticeship Handoff

> **2026-09-22 architecture correction:** the teaching/practice portion described here is now formal **Residency inside University education**, before final canary/evaluation/graduation. Post-graduation bounded company work remains valuable as continuing-education/recertification evidence, but it is no longer the primary Residency teaching stage. See `docs/COS-UNIVERSITY-RESIDENCY-2026-09-22.md` and the Residency invariant in `ONBOARD.md`.

**Date:** September 21, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts  
**Purpose:** durable continuation instructions for the University training -> proof -> work -> outcome -> remediation loop.

## Owner intent

University success is not "a Hugging Face artifact exists." The operating loop is:

```text
learn
-> prove
-> graduate
-> activate
-> perform bounded real company work
-> observe objective outcome
-> verify the outcome
-> strengthen or remediate
-> work again
```

A specialist that clears every existing gate should begin appropriate iTMounts work immediately through the governed runtime. Do not leave a qualified graduate idle merely because training is complete.

## Relationship to ONBOARD.md

This handoff operationalizes the University graduate-adoption invariant already recorded in `ONBOARD.md`:

```text
University training
-> independent improvement / safety / transfer / retention evaluation
-> exact-artifact Production canary + rollback proof
-> graduate registry (pending_runtime)
-> evidence-gated runtime activation
-> COS-primary generalist routing or subject-relevant COS / Builder worker routing
-> provider + graduate ownership telemetry
-> verified Production outcomes
-> continuing education / remediation / recertification
```

Computer Science and Cybersecurity graduates may enter the bounded `coder` lane. Other qualified subjects enter bounded critic/verifier/researcher lanes. COS-primary remains a separate, stricter Reasoning & Decision Science/generalist path.

## Ready-to-work gate

A trained specialist is not ready to work until all applicable gates succeed:

1. immutable exact artifact identity/hash;
2. independent holdout improvement;
3. safety threshold/regression pass;
4. unseen-transfer pass;
5. delayed-retention pass;
6. exact-artifact Production canary;
7. rollback proof;
8. graduate-registry record;
9. runtime activation reaches `active`;
10. served identity/runtime health proof;
11. COS routing remains inside the declared bounded subject/problem class.

Never weaken the evaluator or delay merely to create a graduate.

## Real work after graduation

The first qualified Computer Science & Coding graduate should be activated narrowly for reversible Builder work such as:

- code repair with tests/proving commands;
- debugging and root-cause analysis;
- code review and implementation verification;
- bounded software research;
- test/CI repair;
- small, attributable Builder tasks.

COS remains the orchestrator. A specialist credential grants expertise, not independent authority.

## Objective Production outcomes

Every apprenticeship task should preserve exact candidate/artifact attribution and capture evidence such as:

- test/build result;
- deployment health;
- whether the reported defect was actually fixed;
- whether diagnosis was independently confirmed;
- whether the owner accepted/used the result;
- later contradiction/regression;
- adherence to scope and authority.

A model's self-assessment is not a verified Production outcome.

## Continuing education

Successful verified outcomes strengthen evidence but do not automatically widen authority.

Failures must feed:

```text
verified real-world failure
-> weakness evidence
-> failure-derived remediation curriculum
-> retraining/practice
-> independent evaluation
-> recertification or quarantine
```

Failure is useful training evidence. Do not hide it.

## Current Production checkpoint — September 21, 2026

This section is a dated snapshot. Re-query Production before acting.

### First post-remediation Computer Science artifact

Candidate:

`mass:6746040b-abe8-4d18-9c90-ba741d039bbc:91f10d68b71778f9`

Artifact:

`cadomos/itmounts-student-5214f719d167`

Artifact hash:

`64eaadad4d718c78bb146ff83da84335f2b66d6a03dd5e2a7274aea472ad7d15`

The 12-hour retention window opened and the independent evaluator ran. The artifact **failed and is quarantined**:

- baseline score: 1.00;
- trained-artifact score: 1.00 -> no holdout improvement;
- safety score: 0.50 -> absolute safety gate failed;
- unseen transfer: baseline 0.75 vs artifact 0.25 -> failed;
- delayed retention: baseline 0.75 vs artifact 0.50 -> failed;
- no graduate-registry record was created.

Therefore this artifact must not receive Builder traffic.

### Training-quality repair

Broken/stale PR #2685 is closed and superseded.

Its intended response-anchor repair was rebuilt from current main and merged as **PR #2691**. Exact Production merge commit:

`c79817e0883778a7baf43b142ef33d641ab3029e`

That exact commit is Production READY. The replacement:

- uses frontier plan v2;
- performs one bounded SFT anchor epoch over verified hosted-faculty prompt/response rows;
- validates dense-teacher tokenizer compatibility **before** the paid anchor begins;
- continues the same anchored LoRA student into stable fully on-policy `DistillationTrainer` GKD;
- records the anchor in the durable training receipt;
- does not weaken independent evaluation.

A true post-v2 artifact is identifiable by a training receipt containing:

```text
optimizer = frontier_response_anchor_then_stable_on_policy_distillation
frontierResponseAnchorRequired = true
frontierResponseAnchorEpochs = 1
frontierResponseAnchorItems > 0
```

Do not call an artifact v2 without that receipt.

### Builder canary priority

PR #2690 introduced the bounded Builder proof lane, but its original date-only definition has now been proven too broad: two old-recipe Computer Science artifacts created after the cutoff already obtained canary passes at approximately 14:57 UTC and 15:00 UTC, consuming that quota before a true response-anchor v2 artifact existed.

The current invariant therefore counts only **confirmed v2** Computer Science artifacts whose durable receipt proves:

```text
optimizer = frontier_response_anchor_then_stable_on_policy_distillation
frontierResponseAnchorRequired = true
frontierResponseAnchorEpochs = 1
frontierResponseAnchorItems > 0
```

Until two such v2 Computer Science artifacts have durable exact-artifact canary passes, they receive bounded priority over the legacy backlog. Production also proved that the priority cohort must be included in the database read itself: the first true v2 artifact sat behind roughly 336 older uncanaried artifacts while the issuer fetched only the oldest 200, so an in-memory priority sort could never see it. The issuer now combines the bounded oldest-first page with a separately bounded confirmed-v2 Computer Science proof query before applying policy. This remains scheduling only and does not bypass independent evaluation, one-canary concurrency, spend ceilings, exact-artifact binding, rollback, promotion or Production-traffic gates.

### Canary refresh / graduate runtime protection

Broken/stale PR #2687 is closed and superseded.

Its intended repair was rebuilt from current main and merged as **PR #2692**. Exact Production merge commit:

`0e55fc459fb5006a628cf7ab65a92e89f3dd96a3`

That exact commit is Production READY, and the forward Supabase migration `mass_distilled_canary_endpoint_refresh_claim` is applied in Production. The repair:

- permits a historical exact-artifact canary pass to be repeated only when the CURRENT host-controller approval explicitly carries `endpointRefresh=true`;
- keeps ordinary duplicate-canary rejection;
- protects active RunPod graduate endpoint IDs from sibling canary/evaluator capacity reclamation;
- fails closed on graduate-registry read failure;
- preserves one invocation, <= $0.20, three preflight failures, exact-artifact binding, and no Production traffic authority.

### Hosted-faculty cost efficiency

PR #2689 is merged and Production-live. Hosted-teacher routing balances expected dollars rather than equal call counts, gives Claude bounded completion headroom, and avoids immediately repurchasing a failed primary provider on partial retries.

## First confirmed v2 Computer Science artifact

The first fully proven response-anchor v2 Computer Science artifact now exists.

Candidate:

`mass:58de5633-bf37-421d-bfb1-3eb1b4102c4b:aebeadfae8866e8a`

Artifact:

`cadomos/itmounts-student-0136e0e0c5af`

Artifact hash:

`f54f03ccb1de40de3e89f3c19cb09e8d3cde01ac9c01380f107ef00aabb64d6e`

Created:

`2026-09-21 17:20:26.126267Z`

Its durable receipt proves:

```text
optimizer = frontier_response_anchor_then_stable_on_policy_distillation
frontierResponseAnchorRequired = true
frontierResponseAnchorEpochs = 1
frontierResponseAnchorItems = 16
frontierResponseAnchorTrainer = SFTTrainer
```

The artifact is currently `evaluation_pending`. Its mandatory 12-hour delayed-retention eligibility begins at approximately:

`2026-09-22 05:20:26Z` / `2026-09-22 01:20:26 EDT`

Do not evaluate it as graduation-ready before that boundary.

### Remediation material defect found during this run

The artifact's source attribution was 90% teacher-synthetic, 10% real-source and 0% failure-derived even though independently verified Computer Science failures had generated remediation rows.

The cause was not the retained-material de-duplication fence. The generator created a new provenance/content hash for each failed candidate, but repeated gate patterns could emit effectively identical retained teaching material. Material de-duplication correctly collapsed those duplicates before packaging.

The repair must therefore preserve de-duplication and make the remediation **material itself** distinct. The corrected remediation-v2 design uses only bounded general subject-level practice context, verification mode and difficulty variation derived from failed gate classes plus an opaque one-way identity input. Candidate IDs, raw chats, private holdouts, hidden exams, evaluator output and private evidence never enter retained training material. The remediation identity is versioned so already-verified failures can be re-seeded once under the corrected format.

### Current timeline

1. the exact v2 artifact above is already trained;
2. exact-artifact canary may run before the 12-hour retention deadline when the canary semaphore is free;
3. earliest independent delayed-retention evaluation is approximately 2026-09-22 05:20:26Z;
4. if improvement, safety, unseen-transfer and delayed-retention all pass, verify canary/rollback evidence, graduate registry and runtime activation;
5. immediately assign one narrow, reversible Builder apprenticeship task.

The retention clock is now anchored to the exact artifact creation timestamp above. It is no longer an estimate from merge or dispatch time.

## Exact continuation runbook

1. Read current `ONBOARD.md`, this handoff and `SKILLS.md`.
2. Re-query current `main`, University PRs, Vercel Production and Supabase.
3. Track exact candidate `mass:58de5633-bf37-421d-bfb1-3eb1b4102c4b:aebeadfae8866e8a` and artifact `cadomos/itmounts-student-0136e0e0c5af`.
4. Confirm its exact-artifact canary is prioritized by the v2-only Builder proof lane when the global canary semaphore is available.
5. Do not independently evaluate it before the 12-hour delayed-retention boundary.
6. If evaluation fails, inspect holdout/safety/transfer/retention evidence and verify corrected failure-derived remediation is packaged without weakening material de-duplication.
7. If evaluation passes, verify exact artifact hash/revision, canary and rollback.
8. Verify graduate registry -> activation -> served identity/health.
9. Route one bounded real Builder task immediately.
10. Record objective outcome evidence with exact candidate/artifact attribution.
11. Feed success/failure into continuing education.
12. Repeat for additional specialists.
13. Continue the stricter COS-primary generalist path separately.

## Useful Production surfaces

- `cos_local_distillation_artifacts`
- `cos_university_mass_distillation_batch_runs`
- `cos_university_distilled_evaluation_runs`
- `cos_university_graduate_model_registry`
- `cos_university_learning_assurance_events`
- `cos_continuous_learning`
- `saas/app/api/cron/cos-university-graduate-activation/route.ts`
- `saas/lib/ai/cos/cosUniversityGraduateRuntime.ts`
- `saas/app/api/admin/cos-verified-outcomes/route.ts`
- `saas/app/dashboard/cos-verified-outcomes/page.tsx`

## Definition of success

The University is successful when qualified graduates do appropriate iTMounts work, their outcomes are objectively measured, failures cause remediation, unhealthy graduates can be quarantined/rolled back, and progressively more proven capability is supplied by iTMounts-trained graduates.

**Operational shorthand: learn -> prove -> work -> observe -> correct -> work again.**
