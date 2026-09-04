# Concierge Goal-Completion Loop — 2026-09-04

## Status

**Implementation active on `feat/concierge-goal-completion-20260904`; not Production-accepted.**

No Production claim is valid until the exact branch/PR passes CI and Preview, merges, the exact Production deployment is READY, and real Concierge observations confirm the behavior described below.

## Canonical ownership

**COS owns the user objective. Concierge is the public delivery surface. Specialists and tools are workers.**

A worker result is not automatically the answer. COS must evaluate whether the original user objective is actually complete before Concierge presents the result as complete.

The goal-completion contract is deliberately small and user-deliverable:

```ts
{
  status: 'done' | 'partial' | 'blocked',
  evidence: string[],
  unresolved: string[],
  recommended_next_action: 'deliver' | 'retry' | 'delegate' | 'ask_user' | 'wait',
  attempts?: number,
}
```

This contract records execution state and proof codes. It is **not** hidden reasoning and must never contain chain-of-thought, secrets, private provider configuration, or private company context in public scope.

## Completion loop

For an actionable Concierge request, COS should:

1. identify the user's actual objective;
2. select the bounded specialist/tool path allowed by the current public/private authority scope;
3. execute the path;
4. inspect returned evidence against the original objective;
5. when the objective is incomplete, choose a safe recovery action;
6. retry or delegate only when that action is authorized and safe to replay;
7. ask the user only when a required fact, reference, approval, authentication step, or other non-inferable input remains unresolved;
8. report completion only when evidence supports completion.

`partial` and `blocked` are internal objective states that may still produce a useful user-facing explanation. They are not permission to invent a result or weaken verification.

## Automatic-retry boundary

Automatic replay is deny-by-default for consequential work.

- read-only retrieval may be retried within bounded time/attempt limits;
- explicitly idempotent operations may be retried within their existing idempotency contract;
- metered provider actions are not replayed merely because the objective remains incomplete;
- financial, publishing, messaging, repository, external mutation, approval, security, and other consequential actions are not replayed without their existing authorization/idempotency controls;
- a timeout or ambiguous result never authorizes duplicate external action;
- specialist capability never widens authority.

Existing tool-specific correction loops may remain only when they are already bounded as part of one authorized operation and retain their own verification and metering controls.

## First vertical: verified named-person visuals

The first implementation applies the completion loop to a concrete Concierge failure mode.

Before returning `visual_person_reference_not_verified`, named-person visual resolution now performs a bounded set of **read-only** Wikimedia Commons discovery strategies. The strategies run in parallel to avoid serial timeout multiplication. Every candidate is still subject to the existing identity-token, portrait-signal, host-allowlist, byte-limit, and image-verification rules. Recovery never substitutes a different identity.

If all safe reference searches are exhausted, Concierge identifies the unresolved person or people and asks for the missing full name/reference image rather than immediately returning the old generic failure. The response includes a `goal_completion` state and reference-attempt count.

Successful visual delivery records `done` evidence. A generated-but-unsaved member visual records `partial`. Exhausted reference/identity verification records `blocked` and retains fail-closed behavior.

## Acceptance evidence required

Before calling this Production-accepted, observe at minimum:

1. CI and exact Preview are green for the merged change set.
2. One real Concierge named-person request resolves through the normal verified path and returns `goal_completion.status = done`.
3. One controlled unresolved-name case exhausts safe read-only recovery, names the unresolved subject, returns `blocked`, and does not create a substitute identity.
4. One identity-verification failure remains blocked after the existing bounded generation correction attempts.
5. Guest metering still permits only the configured anonymous trial and does not double-charge/replay because of goal recovery.
6. Signed-in durable visual persistence still succeeds and produces the existing preview/download behavior.
7. No public response exposes private COS/company/provider context through the new completion payload.

## Expansion rule

After the first vertical is accepted, extend the same contract to Software Specialist/Builder, artifact creation, research/current-fact synthesis, and other Concierge workers one family at a time. Do not install a generic HTTP-level retry wrapper around Concierge. Each family must declare what evidence proves completion, which failures are recoverable, and whether replay is safe.
