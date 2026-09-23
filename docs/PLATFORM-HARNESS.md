# iTMounts Platform Harness

Status: canonical architecture foundation, 2026-09-22.

The Platform Harness is the shared controlled operating layer for iTMounts intelligent workers.
It composes existing systems rather than replacing them.

## 1. Platform Harness architecture

```text
iTMounts PLATFORM
        |
        v
PLATFORM HARNESS LAYER
        |
  +-----+---------+----------------+
  |               |                |
Identity        Authority       Environment
agent/artifact  Referee/        sandbox/prod
                Guardian
  |               |                |
  +---------------+----------------+
                  |
                  v
             HarnessRun
       objective + manifest + limits
                  |
                  v
           COS / Specialist
                  |
                  v
        Capability Resolver
                  |
      +-----------+-----------+
      v           v           v
     MCP       Native APIs    Agents
 GitHub/Vercel DB/services  delegation
 Supabase/Browser
      +-----------+-----------+
                  |
                  v
           GOVERNED SOCKET
                  |
         controlled execution
                  |
    observe -> act -> recover -> verify
                  |
                  v
         TRAJECTORY JOURNAL
                  |
     observable tools/evidence
       cost/latency/failures
       (no chain-of-thought)
                  |
                  v
          OUTCOME VERIFIER
                  |
           FAILURE ROUTER
                  |
      +-----------+------------+
      v           v            v
 Self-Healing  University  Referee/Guardian
 infrastructure competency    authority
      |           |
      +------v----+
             |
       Durable Evidence
```

Ownership remains explicit:

- Agent Gateway is the Governed Socket.
- Referee/Guardian/host owns authority verification.
- Provider Hub/MCP owns capability exposure.
- Self-Healing owns infrastructure recovery.
- University owns education, competency, remediation, and Residency semantics.
- The Platform Harness owns shared run orchestration contracts, profile constraints,
  observable trajectory evidence, verification handoff, and failure routing.

## 2. Platform Harness profiles

```text
iTMounts PLATFORM
        |
        v
PLATFORM HARNESS
        |
        +-- residency
        +-- production
        +-- sandbox
        +-- self_healing
        +-- security_lab
        +-- replay
        +-- evaluation_runtime
```

All profiles use the same harness architecture. The profile changes constraints and evidence
behavior, never the underlying authority source.

- **residency**: supervised practical education in synthetic/sandbox environments. It may emit
  sanitized competency evidence to University. It cannot grant Production authority.
- **production**: operational work. Capabilities exist only where the trusted authority envelope
  and Governed Socket permit them.
- **sandbox**: isolated non-Production work.
- **self_healing**: infrastructure repair. Production mutation still requires separate exact
  authority for the capability and environment.
- **security_lab**: controlled security exercises within separately authorized lab scope.
- **replay**: read-only incident/case reproduction by default.
- **evaluation_runtime**: execution environment for independent evaluation. The harness does not
  own hidden exam material, feed it into training, or decide graduation.

## Non-negotiable invariants

1. `requested work ∩ profile ∩ trusted authority ∩ Provider Hub assigned/available capability supply` is the maximum executable surface.
2. A profile may reduce authority but can never widen it.
3. Every executable action still passes through `agent-gateway/runGoverned()`.
4. Infrastructure failure is routed to Self-Healing, not scored as model incompetence.
5. Competency failure is routed to University, not treated as infrastructure repair authority.
6. Authority boundaries route to Referee/Guardian and must not trigger workaround/retry behavior.
7. Verified success produces durable evidence; task success by assertion is insufficient.
8. Trajectory evidence records observable actions/results, never private chain-of-thought.
9. Evaluation runtime remains isolated from Residency teaching/remediation material.

## Runtime composition

The shared Harness runtime composes the architecture rather than only describing it:

```text
Harness manifest
-> Provider Hub discovery for exact tenant/environment/portable assignment
-> Governed Socket execution
-> observable trajectory
-> independent verifier
-> strict failure owner
```

Authority alone does not make a capability available, and discovery alone does not grant authority.
Consequential capabilities require an explicit consequential authority ceiling; a generic mutating/write
grant is insufficient.

Builder Residency is the first concrete educational consumer. Its default capability request covers
governed GitHub branch/edit/PR work plus Vercel, Supabase, Playwright and Chrome DevTools diagnostics,
while deliberately excluding merge, Production deployment, raw SQL, migrations, edge-function
deployment, and similar consequential actions.

Residency is practical formal education:

```text
trained immutable artifact
-> supervised sandbox Residency
-> competency evidence / remediation / retraining
-> Residency completion
-> exact-artifact final canary + rollback proof
-> independent final examinations
-> graduation
-> separately governed Production practice
```

Hidden final-exam material is forbidden from Residency. The independent verifier, not the resident
worker, owns failure attribution between competency and infrastructure.


## Builder Residency orchestration

The Residency scheduler is bounded to one enrolled artifact/case per invocation. It selects remediation
work first, otherwise the next unseen practical case, executes only through the shared Platform Harness,
persists case/competency evidence, and then delegates educational-standing persistence to the canonical
Residency assessment store.

The scheduler never enables the final-evaluation Residency gate, grants Production traffic, or authorizes
promotion.

Current practical-case coverage is intentionally reported rather than hidden: the first catalog covers
3 of the 13 Builder competencies. When those available cases are exhausted, the scheduler returns
`waiting_for_residency_cases` with the missing competency list instead of manufacturing completion.
The next Residency workstream is therefore to add distinct, rights-safe practical case families for the
remaining competencies, especially Vercel recovery, Supabase diagnosis, Playwright verification,
Chrome DevTools evidence, rollback judgment, MCP recovery, security/authority compliance, repository
navigation, TypeScript/Next.js repair, and cross-specialist escalation.


## Residency final-evaluation handoff

For Builder / Computer Science artifacts, `evaluation_pending` means the artifact is trained and eligible
for practical Residency, not yet eligible for final evaluation. The database claim boundary now requires
the exact candidate + artifact hash to have a durable `residency_complete` enrollment before either the
final runtime-canary or independent-evaluation lane may claim it.

A canary that passed before Residency completion is educationally stale for graduation purposes. The
final evaluator therefore requires a fresh exact-artifact canary whose evidence timestamp is at or after
the Residency enrollment's `completed_at`.

This gate is scoped to Computer Science & Coding. Other subjects keep their existing evaluation flow.
The change does not grant promotion, graduation, Production traffic, or wider authority.


## Automatic Residency admission

The Residency cron is also the bounded admission controller for trained Builder artifacts. On each tick it
may admit at most one unenrolled `evaluation_pending` **Computer Science & Coding** artifact, and only while
fewer than four enrollments are actively `resident`, `senior_resident`, or
`remediation_required`.

Admission is exact-artifact/idempotent: candidate, artifact-row identity, trained artifact hash, revision,
program version, and host-generated admission evidence are persisted under the existing unique enrollment
constraints. Admission never grants final evaluation, promotion, Production traffic, or authority.

This prevents the final-evaluation Residency gate from becoming a dead queue: protected Builder artifacts
must have a bounded automatic path from `evaluation_pending` into practical Residency.


## Residency exact-artifact runtime

Residency executes **before** the final exact-artifact canary. Its model binding therefore may not depend
on prior canary evidence. The Residency host resolves the exact immutable trained artifact from
`cos_local_distillation_artifacts`, validates candidate/artifact hash/revision/status/authority state,
parses the immutable Hugging Face model revision, and provisions an isolated scale-to-zero RunPod
runtime using a Residency-specific runtime key.

Runtime provisioning/readiness is infrastructure evidence only. It does **not** write
`production_canary_healthy`, does not satisfy the post-Residency final-canary gate, and does not authorize
Production traffic or promotion.

A provider/sandbox/runtime failure before practical execution is routed to Self-Healing and creates no
competency verdict. The same unseen case variant may be attempted again after infrastructure recovery;
only durable competency evidence remains unique per residency + competency + variant.
