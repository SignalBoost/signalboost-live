# COS Chief-of-Staff Blind Generalization — 2026-09-07

## Purpose

The Chief-of-Staff reliability program exists to improve COS behavior, not to manufacture a passing score. The original four-case acceptance contract remains a fixed reference gate. Passing it is necessary evidence, but it is not sufficient proof that COS generalizes as the owner's operational right hand.

## Frozen v1 rule

`saas/lib/ai/cos/chiefOfStaffAcceptance.ts` is the frozen v1 scorer. Its exact Git blob is locked by mandatory regression. Do not edit its prompts, rules, normalization, or grading semantics to make a live answer pass. If a future scoring defect is independently proven, preserve v1 and create a new version/profile with the change documented explicitly.

The fixed dashboard/API must read only `chief_of_staff_reliability_v1` rows. Blind generalization uses a separate profile so the two measurements cannot overwrite or inflate one another.

## Real COS behavior improvement

The owner-only `cosChiefOfStaff.skill.ts` now performs a general pre-release owner-trust audit. Before releasing an owner answer, COS checks:

- requested scope, source boundary, format, choices, and action count;
- preservation of material supplied facts and correct unknown-state handling;
- ownership of the highest-value unresolved routine action rather than deflection or re-proving settled facts;
- evidence support for status claims such as complete, live, merged, deployed, healthy, failed, or verified.

If an invariant fails, COS repairs the draft before release. This policy contains no acceptance fixture names, numbers, or expected answers.

## Blind generalization profile

Profile: `chief_of_staff_blind_generalization_v1`

Each run generates four fresh cases from a cryptographically derived recorded seed. The competencies remain fixed while names, numbers, deadlines, option labels, deliverables, evidence counts, production checks, positive review facts, and failed gate wording vary.

The four families are:

1. instruction scope and constrained recommendation;
2. bounded evidence accuracy and unresolved-state action selection;
3. routine autonomous follow-through;
4. truthful status reporting without converting missing records into negative facts.

The case manifest and scorer version are stored service-role-only in `cos_chief_of_staff_acceptance_runs`. The owner dashboard does not receive case prompts during execution. The server regenerates the suite from the stored seed and compares a canonical manifest before scoring; generator drift fails closed.

## Retry and evidence integrity

The browser chooses a run UUID before POST. POST is idempotent for that UUID. Before any PUT executes a model turn, the server checks whether that run/case already has a durable result. A lost browser response can therefore be retried without creating a duplicate model turn or duplicate evidence.

Every case still requires fresh local-model execution, no external-AI answer, and recorded provenance. Model self-report never counts.

## Learning loop

After host scoring, the exact COS turn receives a durable outcome through `attachTurnOutcome`:

- pass -> `verifiedSuccess=true`, `repairNeeded=false`;
- fail -> `verifiedSuccess=false`, `repairNeeded=true`;
- non-fresh/unreleased execution -> `escalated=true`.

This makes blind acceptance a source of verified outcome evidence for COS turn learning and failure autopsy rather than a dashboard-only number.

## Failure handling rule

When a blind case fails:

1. preserve the failing prompt, response, provenance, seed, manifest, and host verdict;
2. determine whether the failure is a harness defect or a COS behavior defect;
3. change the harness only when independent evidence proves the harness is wrong;
4. for a genuine COS defect, repair the general COS policy/skill/reasoning path, not the case-specific expected wording;
5. run the fixed regressions;
6. run a new blind cycle with a new seed. The repaired answer to the old case is regression evidence only, never the acceptance proof for generalization.

## Release interpretation

A single blind 4/4 run is evidence of generalization, not universal proof of reliability. Consistency confidence requires repeated fresh seeds. A practical next stage is three consecutive 4/4 blind cycles (12 fresh cases) without scorer changes between cycles. Any failure resets the consistency streak and becomes a COS learning/repair input.

## Security and authority

The blind route remains owner-only. Durable manifests/results remain in service-role-only tables protected by the existing RLS/privilege boundary. This work grants no new production, repository, financial, communication, tenant, or external-provider authority to COS or Concierge.
