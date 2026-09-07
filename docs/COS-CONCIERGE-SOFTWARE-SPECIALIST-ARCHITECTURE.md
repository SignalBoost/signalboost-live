# COS, Concierge, and Software Specialist — Architectural Invariant

**Status:** normative, release-gated architecture

**Owner decision:** COS is the private brain. Concierge is the public mouth. The Software Specialist owns software execution and controls Builder / Platform Engineer after COS selects the software domain.

This document is not descriptive background. It is a repository invariant. Changes that contradict it are architectural regressions even when local tests or a new feature appear to work.

## 1. COS is private

COS is SignalBoost's internal reasoning and orchestration layer. It may infer intent, evaluate evidence, choose a specialist, maintain continuity, challenge a request, and coordinate specialists. It is not a public persona, public product name, or public authority surface.

Public Concierge responses must not present COS as the speaker, worker, fallback product, or visible orchestrator. Internal telemetry may retain COS lineage where required for audit, but public presentation removes the private orchestrator identity.

## 2. Concierge is the mouth and ears

Concierge receives the user's request and communicates the final result. It may carry authenticated identity, conversation context, files, progress, and specialist status. It does not become a second reasoning brain and it does not independently decide software authority or software task completion.

A public or anonymous Concierge session never gains repository mutation authority from wording such as `fix it`, from pasted logs, or from the fact that a request concerns SignalBoost.

## 3. Authority belongs to identity and policy, not UI surface

The same authenticated owner remains the owner whether the request entered through the owner Assistant or through a Concierge delivery surface. A surface can narrow presentation and public disclosure, but it cannot erase legitimate authenticated authority or manufacture authority for an anonymous user.

Repository repair therefore requires all of the following:

- authenticated owner identity;
- explicit repair intent when the preceding turn was passive operational evidence;
- a verified SignalBoost repository target;
- current-state safety checks;
- Software Specialist admission.

The words `assistant`, `concierge`, or an HTTP route name are not authority grants.

## 4. Software Specialist owns software lifecycle

COS selects the software domain and delegates. Once selected, the Software Specialist owns the software objective through completion. It controls Builder / Platform Engineer and is responsible for:

1. preserving the user's software objective and relevant evidence;
2. choosing isolated Builder vs owner-authorized Platform Engineer;
3. repository freshness and target validation;
4. reproduction before edit;
5. engineering iteration;
6. verification;
7. governed write-back / PR handling;
8. continuation and replanning;
9. truthful terminal state;
10. returning the outcome to COS / Concierge for communication.

Concierge must not control Builder. COS must not duplicate the Software Specialist's engineering state machine. Builder is a Software Specialist execution capability.

## 5. Superseded revisions are replanning events

A stale failed SHA must never be edited blindly. It also must not normally terminate the owner's objective by asking the user to rerun a build.

Required behavior:

- verify the current branch head;
- repin execution to that immutable current SHA;
- run the narrowest available current-head failure proof before edit;
- if the proof passes, succeed truthfully with `no_change_required` and make no repository change;
- if the proof still fails, continue automatically into Platform Engineer on the verified current SHA;
- if bounded revalidation cannot complete but current head is verified, let Platform Engineer reproduce before any edit;
- if current repository state cannot be verified at all, fail closed.

`builder_repository_target_superseded` is therefore a retired terminal behavior. Supersession is a continuation / replanning state.

## 6. Passive evidence is not repair authority

Pasting a Vercel or GitHub failure is diagnostic evidence only. The system may explain it and offer an explicit repair handoff. Failure words inside the pasted log do not authorize code mutation.

For the natural two-turn flow:

`failed log` → diagnosis only → user says `fix it` → previous evidence is compacted and carried into Software Specialist → repository repair may begin only if authenticated policy permits it.

## 7. Public disclosure boundary

Public Concierge may say that a **Software Specialist**, **Builder**, or **Platform Engineer** is working when that is useful to the customer. It must not expose the private COS orchestrator as the public worker or persona.

At the canonical browser boundary, public presentation removes internal COS identity from visible replies and removes `orchestrator: cos` from the public payload. This is presentation isolation only; it does not weaken internal provenance or audit evidence.

## 8. Completion ownership

Only the component owning the relevant lifecycle may declare that lifecycle complete:

- COS owns overall reasoning / orchestration outcome.
- Software Specialist owns software-task completion.
- Builder / Platform Engineer supplies engineering evidence to the Software Specialist.
- Concierge communicates the resulting state.

A specialist blocker is returned upward for replanning; it does not silently become abandonment of the user's objective.

## 9. Change-control rule for future developers and AIs

Before changing any of these boundaries, a developer or AI **must**:

1. read `ONBOARD.md` and this document;
2. preserve public/private identity separation;
3. preserve identity-based authority;
4. preserve Software Specialist ownership of Builder;
5. preserve passive-log diagnostic isolation;
6. preserve stale-target current-head replanning;
7. update the dedicated architecture regression if the architecture is intentionally changed;
8. obtain explicit owner approval for an intentional architectural change.

A feature PR must not remove these invariants as collateral refactoring.

## 10. Mandatory acceptance scenarios

The deployment gate must retain coverage proving:

- anonymous/public Concierge cannot gain repository repair authority;
- an authenticated owner can delegate software repair without authority depending on the delivery surface;
- public presentation does not identify COS as the public worker/orchestrator;
- passive logs create no repository mutation;
- explicit `fix it` carries the preceding log into Software Specialist;
- stale failed revisions are repinned to current head;
- a current-head passing proof closes as no-change success;
- a current-head failing proof continues to Platform Engineer;
- unverifiable current state fails closed;
- Builder remains controlled by the Software Specialist.

If any of these fail, the COS/Concierge/Software Specialist architecture is not accepted, regardless of other green tests.
