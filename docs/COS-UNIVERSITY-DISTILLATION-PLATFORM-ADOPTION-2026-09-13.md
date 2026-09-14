# COS University Distillation → Platform Adoption

**Date:** September 13, 2026  
**Repository:** `SignalBoost/signalboost-live`  
**Public product:** iTMounts  
**Status:** normative architecture correction; implementation is evidence-gated

## Owner intent

Distillation inside COS University is not complete when a student model merely becomes a trained artifact.

The intended lifecycle is:

```text
University weakness identified
→ governed teacher/student distillation
→ independent evaluation and graduation/promotion gates
→ graduated model becomes an iTMounts worker/capability
→ COS routes appropriate platform work to the graduate
→ verified Production outcomes feed continuing education
→ fallback/rollback remains available
```

A company would not finance a student's entire education and then treat graduation as successful while the graduate's acquired capability is never used by the company. iTMounts must not do the model equivalent of that.

## Architectural invariant

**A promoted distilled model must enter a governed platform-adoption lifecycle.**

`eligibleForPromotion=true` is an academic/quality gate. It is not the terminal lifecycle state.

For every promoted distilled artifact, the platform must retain a durable employment/adoption record that binds:

- the exact candidate and University subject;
- the exact student/base model identity;
- the exact trained artifact id and immutable artifact hash;
- the evidence that cleared independent promotion gates;
- the intended iTMounts capability scope;
- the serving runtime/model identity once available;
- health/canary evidence for that serving runtime;
- rollback evidence;
- activation, quarantine, retirement and recertification state.

A promoted graduate may temporarily remain `pending_runtime` when no approved serving endpoint exists. It may not silently disappear from the platform lifecycle.

## Platform-wide does not mean indiscriminate routing

The graduate belongs to iTMounts as a whole, but COS remains the Chief-of-Staff orchestrator. A reasoning graduate should help reasoning work; a software graduate should help software work; a specialist graduate should be selected where its proven capability is relevant.

The goal is not to replace every model with every graduate. The goal is that verified learned capability becomes available to the platform rather than remaining stranded in a model repository.

## Safety and authority

This correction does **not** weaken any existing control:

- training remains separately cost-approved where required;
- teacher/evaluator separation remains mandatory;
- private Production/user data remains excluded unless separately authorized by policy;
- independent evaluation, safety regression, unseen transfer, delayed retention, Production canary and rollback proof remain mandatory before promotion;
- a degree or promoted model never expands operational authority;
- activation must fail closed when serving identity, health, provenance or rollback evidence is missing;
- a failing or stale graduate can be quarantined or retired without erasing its historical credential.

## Required implementation sequence

1. **Graduate employment registry** — automatically register every distilled artifact that clears promotion as an iTMounts graduate, initially `pending_runtime` unless an approved runtime is already bound.
2. **Serving binding** — bind the exact promoted artifact to an approved inference runtime/model identity; do not assume a Hugging Face training artifact is already callable in Production.
3. **COS routing** — make active graduate capabilities available through the existing COS-owned routing/control plane rather than creating a competing brain.
4. **Outcome measurement** — attribute routed work and verified Production outcomes to the graduate capability.
5. **Continuing education** — degradation, staleness or repeated poor outcomes trigger remediation/recertification; successful generalized lessons strengthen COS and relevant specialists.
6. **Fallback/rollback** — the existing approved runtime remains available until the graduate proves safe and effective; rollback must be deterministic.

## Current gap discovered September 13, 2026

Before this correction, model distillation could reach `eligibleForPromotion=true`, but the promotion decision had no consumer that employed the graduate in iTMounts runtime work. The trained weights could therefore remain a private artifact while COS/Builder continued using the pre-existing managed runtime models.

That state is academically complete but operationally incomplete.

## Definition of done

Distillation is complete only when one of these states is explicit and durable:

- `active` — the promoted graduate is serving appropriate iTMounts work;
- `pending_runtime` — promotion succeeded but serving infrastructure is not yet approved/ready;
- `quarantined` — the graduate was removed from work because evidence degraded or safety/quality failed;
- `retired` — the graduate was intentionally superseded or decommissioned.

There must be no terminal state equivalent to "graduated, artifact exists, nobody uses it, nobody tracks why."
