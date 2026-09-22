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

The shared runtime controller now composes the architecture rather than only describing it:

```text
HarnessRun request
-> profile + trusted authority intersection
-> Provider Hub discovery for exact tenant/environment/portable assignment
-> Governed Socket execution
-> observable trajectory journal
-> independent outcome verifier
-> strict failure owner
```

Provider Hub discovery is mandatory for tool execution. Authority alone does not make an MCP/native
capability available, and discovery alone does not grant authority. Consequential capabilities require
an explicit consequential authority ceiling; a generic mutating/write grant is insufficient.

The first concrete educational consumer is Builder Residency. Its default capability request includes
governed GitHub read/branch/edit/PR creation plus Vercel, Supabase, Playwright and Chrome DevTools
diagnostics. It deliberately excludes merge, Production deployment, raw SQL, migrations, edge-function
deployment, and similar consequential actions.

Residency sequencing is formal education:

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

Residency teaching material must never contain hidden final-exam material. The independent verifier,
not the resident worker, owns failure attribution between infrastructure and competency.
