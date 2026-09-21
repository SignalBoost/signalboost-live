# COS University Real-World Apprenticeship Handoff

**Date:** September 20/21, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts  
**Purpose:** durable continuation instructions for any agent taking over COS University after training begins producing graduate artifacts.

## Owner intent

University training is not finished when a model artifact is created or even when it passes an academic-style evaluation.

The intended operating model is:

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

This is the University **real-world apprenticeship loop**.

A specialist that graduates should begin doing appropriate iTMounts work as soon as the existing activation and runtime gates allow it. The platform should then learn from what actually happens in Production. Do not leave a qualified graduate idle merely because its academic pipeline is complete.

## Relationship to ONBOARD.md

This document does not replace `ONBOARD.md`. It operationalizes the existing **University graduate adoption loop invariant** already recorded there:

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

`ONBOARD.md` also already states the bounded specialist routing rule: Computer Science and Cybersecurity graduates may enter the `coder` lane for Builder work; other qualified subject graduates enter critic/verifier/researcher lanes; only the separately qualified Reasoning & Decision Science generalist may become COS-primary.

The older architectural foundation is in:

- `docs/COS-UNIVERSITY-DISTILLATION-PLATFORM-ADOPTION-2026-09-13.md`
- `SKILLS.md`
- `saas/app/api/cron/cos-university-graduate-activation/route.ts`
- `saas/lib/ai/cos/cosUniversityGraduateRuntime.ts`

## What "ready to work" means

A trained artifact is **not** ready merely because Hugging Face training completed.

A specialist artifact is ready to perform real iTMounts work only after all applicable existing gates have succeeded:

1. exact training artifact exists with immutable artifact identity/hash;
2. independent holdout improvement passes;
3. safety regression passes;
4. unseen transfer passes;
5. delayed retention passes;
6. exact-artifact Production canary passes;
7. rollback proof exists;
8. graduate registry contains the artifact in the expected lifecycle;
9. evidence-gated runtime activation reaches `active`;
10. COS routing selects the graduate only for its permitted bounded subject/problem class.

Do not weaken an evaluator, threshold, safety rule, authorization boundary, or retention delay to make a student graduate.

## Specialists graduate and work first

Specialists do not need to wait for COS itself to become the final primary graduate.

Examples of intended first assignments after activation:

- **Computer Science & Coding / Software**: bounded Builder coding, debugging, code review, test repair, implementation verification, software research;
- **Cybersecurity**: authorized defensive analysis, secure code review, telemetry/evidence analysis, policy-compliant validation inside the signed scope;
- **Statistics & Data Science**: quantitative analysis, experimental review, measurement, evidence interpretation;
- **Economics & Finance**: bounded financial/economic research and analysis that does not grant spending or transaction authority;
- **Law, Regulation & Governance**: research, comparison, verification and drafting support without expanding legal or operational authority;
- other qualified subjects: critic, verifier, researcher or other already-declared bounded lanes.

A subject credential grants expertise, not authority. Existing approvals and deterministic governance remain controlling.

## COS delegates real company work

After activation, COS should treat an active specialist graduate as an expert worker.

Instead of only giving exams, COS should assign real company tasks that match the graduate's activation scope, such as:

- diagnose a real platform defect;
- review or repair code;
- inspect current telemetry and produce a verified diagnosis;
- research a real market/product/technical question;
- verify another worker's result;
- prepare a bounded campaign or analysis;
- analyze an incident and identify evidence-supported remediation;
- perform Builder work with real proving commands.

COS remains the orchestrator. A specialist does not become an independent competing brain.

## Objective Production outcome requirement

Real-world work must generate evidence about whether the graduate was actually useful.

The platform should answer, with host-verifiable evidence where applicable:

- Did the code compile/test/pass the requested proof?
- Did the deployment remain healthy?
- Did the repair actually fix the reported Production failure?
- Was the diagnosis later confirmed?
- Was the result accepted or used by the owner?
- Did a later independent check contradict the graduate?
- Did the graduate stay inside its authority and scope?
- Which exact candidate/artifact handled the work?

Relevant existing surfaces include:

- Builder/Platform Engineer verified execution evidence described in `ONBOARD.md`;
- `saas/app/dashboard/cos-verified-outcomes/page.tsx`;
- `saas/app/api/admin/cos-verified-outcomes/route.ts`;
- the University assurance/outcome ledgers and graduate/runtime attribution already implemented in the platform.

A model's self-assessment is not a verified Production outcome.

## Continuing education

After real work:

### Successful outcome

A successful, independently supported outcome may strengthen the graduate's demonstrated competence and provide continuing-education evidence. It must not grant wider authority merely because the outcome was successful.

### Failed or weak outcome

A failure, regression, unsafe answer, poor transfer result, incorrect diagnosis or stale competence should feed the existing remediation/recertification path:

```text
real-world failure
-> objective evidence
-> subject/competency weakness
-> failure-derived remediation curriculum
-> retraining / practice
-> independent evaluation
-> recertification or quarantine
```

Do not hide failures or weaken the evaluator. Failure is useful training evidence.

## COS eventually becomes the working primary brain

Specialist activation and COS-primary activation are deliberately separate.

COS itself may become the working primary graduate only when the existing stricter generalist gate is satisfied. The current architecture intentionally restricts primary generalist activation to the qualified `reasoning_decision_science` artifact and requires, in addition to artifact-level evaluation/canary/rollback gates:

- awarded A/A+ generalist undergraduate credential;
- current A/A+ generalist competence;
- no unresolved undergraduate remediation;
- served identity and runtime health proof.

Once active, that graduate is selected ahead of the ordinary base reasoner for eligible COS-primary work. Specialists remain subordinate expert workers. RunPod/base runtime and DeepInfra remain governed fallback compute according to `ONBOARD.md`.

## First real-life deployment policy

When the first new specialist artifact clears every mandatory gate:

1. activate it immediately through the existing graduate activation path;
2. keep the initial scope narrow and subject-relevant;
3. route a real, reversible company task to it;
4. preserve exact candidate/artifact attribution;
5. collect objective proof of the result;
6. compare behavior with the existing runtime/baseline where meaningful;
7. widen the workload only when evidence supports widening;
8. automatically remediate or quarantine on verified regression/failure according to existing policy.

Do not wait for every specialist or COS-primary to graduate before allowing the first qualified specialist to work.

## Current continuation checkpoint — snapshot at 2026-09-21 UTC

This section is a dated handoff snapshot. Future agents **must re-query Production before acting**.

### Remediation pipeline

PR #2684 is merged and Production-confirmed. Failure-derived remediation is reaching new curriculum batches.

### First post-remediation Computer Science artifact

At this snapshot:

- candidate: `mass:6746040b-abe8-4d18-9c90-ba741d039bbc:91f10d68b71778f9`
- subject: `Computer Science & Coding`
- artifact: `cadomos/itmounts-student-5214f719d167`
- artifact hash: `64eaadad4d718c78bb146ff83da84335f2b66d6a03dd5e2a7274aea472ad7d15`
- training completed: `2026-09-21 02:14:24.889Z`
- local artifact status: `evaluation_pending`
- no independent evaluation row existed yet at the snapshot.

Mass-distilled evaluation enforces a hard 12-hour delayed-retention minimum. Therefore this artifact cannot become independently evaluation-eligible before approximately:

`2026-09-21 14:14:25Z` / `2026-09-21 10:14:25 EDT`.

That is an **earliest eligibility time, not a graduation guarantee**.

### Training-quality follow-up

PR #2685 was opened to make verified frontier-faculty prompt/response material directly supervise the student through a bounded response-anchor stage before the existing on-policy GKD pass. At the time this handoff was written, #2685 was still open and `main` had advanced due to later work. Any agent continuing #2685 must re-scan/reconcile with current `main`, refresh the main-write token and acknowledgements, rerun proof, and only then consider integration.

Do not claim that the artifact above used #2685. It was trained under the earlier recipe.

## Exact next-agent runbook

When taking over this work:

1. **Read current `ONBOARD.md` and this handoff.**
2. **Re-query current `main`, open University PRs, Production deployment, and live Supabase state.**
3. Find the oldest/newest relevant `evaluation_pending` artifacts in `cos_local_distillation_artifacts`.
4. For the first post-remediation candidate above, do not manually bypass the 12-hour retention gate.
5. At/after retention eligibility, verify whether `cos_university_distilled_evaluation_runs` contains a completed evaluation for the exact candidate/artifact.
6. If evaluation fails:
   - inspect which of holdout improvement, safety, unseen transfer or delayed retention failed;
   - inspect real candidate answers/evidence;
   - improve curriculum/training recipe or runtime correctness;
   - never weaken the independent evaluator merely to create a pass;
   - confirm failure-derived remediation feeds the next training cohort.
7. If evaluation passes every required gate:
   - verify exact artifact hash/revision;
   - verify exact-artifact RunPod canary;
   - verify rollback reference/proof;
   - verify the graduate is registered in `cos_university_graduate_model_registry`;
   - verify activation progresses through the existing `cos-university-graduate-activation` path to `active`;
   - verify served-model identity and runtime health;
   - verify COS routing selects it only for its bounded subject scope.
8. **Immediately assign a real bounded company task** appropriate to that specialist.
9. Collect objective Production/Builder/outcome evidence with exact graduate attribution.
10. Feed success/failure into continuing education and verify the loop closes.
11. Repeat for additional specialists.
12. Separately continue the stricter Reasoning & Decision Science/generalist path until COS itself can become primary.

## Useful Production tables / evidence surfaces

Re-verify schema before relying on any column, but the current workflow uses:

- `cos_local_distillation_artifacts` — artifact lifecycle;
- `cos_university_mass_distillation_batch_runs` — training lineage;
- `cos_university_distilled_evaluation_runs` — independent evaluation results;
- `cos_university_graduate_model_registry` — graduate lifecycle and activation;
- `cos_university_learning_assurance_events` — durable University evidence;
- `cos_continuous_learning` — continuing/remediation curriculum evidence.

Key implementation locations:

- `saas/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts`
- `saas/app/api/cron/cos-university-graduate-activation/route.ts`
- `saas/lib/ai/cos/cosUniversityGraduateRuntime.ts`
- `saas/app/api/admin/cos-verified-outcomes/route.ts`
- `saas/app/dashboard/cos-verified-outcomes/page.tsx`

## Definition of real-world University success

The University is not complete merely because training jobs are running or artifacts exist.

Success is demonstrated when:

- qualified specialists are active and doing appropriate iTMounts work;
- their real results are objectively measured and attributed;
- failures cause useful remediation;
- successful generalized lessons strengthen future work;
- unhealthy or regressed graduates can be quarantined/rolled back;
- COS eventually qualifies as the primary generalist brain under the stricter gate;
- the platform increasingly relies on independently proven iTMounts graduates rather than treating training as an isolated academic exercise.

**Operational shorthand: learn -> prove -> work -> observe -> correct -> work again.**
