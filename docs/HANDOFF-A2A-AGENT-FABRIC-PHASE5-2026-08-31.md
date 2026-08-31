# SignalBoost A2A Agent Fabric — Phase 5

Date: 2026-08-31
Status: implementation active; not Production-accepted

## Owner direction

COS remains the generalist brain. It should delegate only when a specialist materially helps. Normal user language may trigger specialist planning, but a generated plan is never authority. A2A remains agent-to-agent; MCP/Provider Hub remains tools/data; buyer systems stay pluggable.

## Phase 5 objective

Allow COS to make a conservative, deterministic specialist-routing decision from ordinary user language, validate that decision against the canonical specialist catalog and exact host scope, and otherwise answer through the existing COS Primary path.

```text
normal user turn
→ conservative specialist-intent planner
→ no clear specialist benefit? → COS Primary
→ clear specialist intent + exact host scope?
→ structured specialist plan proposal
→ canonical family/skill validation
→ exact buyer assignment validation
→ existing Phase 2 approval/audit policy
→ buyer-owned A2A transport
```

## Required invariants

1. Generalist is the default. Ambiguous or weak intent never delegates.
2. The planner may only emit family/skill pairs present in the canonical A2A specialist catalog.
3. The planner never selects an agent ID from natural language.
4. Delegation requires an installed governed host plus exact tenant/environment/portable scope; otherwise COS answers itself.
5. Write/consequential intent does not imply approval. Existing Phase 2 approval/audit rules still apply before transport creation.
6. A2A delegation never grants MCP/tool authority.
7. Explicit structured specialist plans from trusted callers remain supported and independently validated.
8. Public/non-privileged hosted sessions cannot cause specialist delegation.
9. Existing COS freshness, provenance, prompt-security, and model-routing behavior remains authoritative whenever the turn stays generalist.
10. Planner output is deterministic and testable; no model-generated routing authority is introduced in this phase.

## Initial natural-language coverage

- Marketing: research, planning, approved organic publishing, paid-campaign mutation.
- Sales: account research, outreach planning, CRM writes, approved outreach sending.
- Self-Healing: diagnosis, remediation planning, approved remediation/rollback, independent verification/certification.

## Non-goals

- no unrestricted swarm;
- no semantic/vector agent discovery;
- no model-selected arbitrary skill IDs;
- no automatic approval;
- no buyer endpoint/credential storage;
- no silent fallback from a blocked specialist mutation to another mutation path.

## Acceptance

Before merge: planner regressions, Phase 4 runtime regressions, A2A typecheck, SaaS tests/build, onboarding/integrity/QA, Playwright, diagnostics, and exact Vercel Preview must be green.
