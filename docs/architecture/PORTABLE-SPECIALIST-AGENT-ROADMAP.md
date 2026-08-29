# Portable Specialist Agent Roadmap

**Status:** proposed engineering and product sequence; no implementation is implied by this document.  
**Read with:** `ONBOARD.md`, `docs/architecture/SIGNALBOOST-ARCHITECTURE-1.0.md`, and `docs/architecture/CONTINUOUS-AUTONOMY-AND-RECOVERY.md`.

## Decision

SignalBoost will keep one COS control plane. COS owns policy, identity, tenant isolation, planning, evidence, approval, audit, memory and outcome learning. A portable may optionally ship with a narrowly-scoped specialist agent. Buyers may instead connect their own model or agent through the existing governed host/adapter boundaries.

The platform is customer zero. A capability is not marketed as autonomous until the same governed capability has safely completed real SignalBoost operating cases with recorded evidence.

An agent is not a second COS brain. It is a constrained worker that receives a defined task, a small capability set and a scoped memory view from COS.

```text
request or incident
→ COS: classify, plan, authorize, route
→ specialist: bounded work using portable-specific tools
→ COS: verify outcome, require approval where needed, audit and learn
```

## Delivery order

### 0. Establish product truth

Keep catalog status separate from commercial readiness. A `live` or `licensingAvailable` manifest is not evidence that a buyer can install, operate, upgrade and support the product. The commercial-readiness report currently requires evidence across ten dimensions and is the release authority for sellable enterprise claims.

**Done when:** every public product page and sales statement uses the correct implementation and commercial-readiness status.

### 1. Build the Developer Agent foundation first

Before portable specialists, COS must be able to develop inside a user-owned isolated workspace. The required loop is: inspect files → edit files → run in a sandbox → read the result → repeat within a strict cap → return the resulting files and commands that ran.

Builder uses the same COS reasoning foundation but is an authenticated workspace, not the public Concierge. Public Concierge must not acquire owner, repository, secret or execution authority merely because it can route a signed-in user to Builder.

The first tool set is deliberately small: `list_files`, `read_file`, `write_file`, `edit_file`, and `run`. The workspace is per user; the sandbox never receives host filesystem access, inherited environment, credentials, repository write access, deployment access or network access by default.

**Done when:** the three golden paths work end-to-end: repair a supplied traceback, create and run a requested file, and return a downloadable output file. A model description without successful tool receipts is not a completed development task.

### 2. Define the shared Specialist Agent Contract

Create one provider-neutral contract, reused by all specialists. It must declare:

- stable agent ID and owning portable ID;
- allowed capabilities and explicit read/write/consequential classification;
- tenant, organization and portable memory scope;
- maximum tool calls, time, cost and concurrency;
- required input/output and evidence receipt formats;
- approval and escalation requirements;
- prohibited actions; and
- evaluation suite and rollback/disable switch.

The contract must not contain provider credentials, broad host access or implicit cross-portable authority.

**Done when:** a deliberately unconfigured specialist constructs safely, reports its missing dependencies, and cannot invoke an ungranted tool.

### 3. Finish the generalist operating foundation

Before training any domain specialist, make COS and generic workers consistently capable of bounded planning, research, tool use, verification, failure explanation and outcome retention. Reuse the existing reasoning-worker, Agent Gateway, memory, evidence, approval and audit boundaries; do not replace them with an agent framework.

Training means governed skills, runbooks, accepted knowledge, evaluations and verified outcomes. It does not mean uncontrolled model-weight modification or storing private chain-of-thought.

**Done when:** held-out evaluations show the generalist can select only approved tools, produce evidence-backed results, and fail safely when evidence or authority is missing.

### 4. Build the Platform Engineering Agent for customer zero

Build the first specialist for SignalBoost itself. It reads the repository, ONBOARD rules, incidents, logs, tests and CI evidence. For code-shaped failures it may create a branch and draft a change/PR only after its tests pass. It never merges, edits secrets, changes workflows, applies schema migrations, force-pushes, or deploys Production.

Runtime recovery remains the Self-Healing Supervisor's domain. The engineering agent is the diagnosis-and-draft path for code/configuration defects.

**Done when:** two real, non-destructive SignalBoost incidents complete this loop: observe → diagnose → draft → test → human merge/reject → verify → outcome recorded.

### 5. Prove safe runtime recovery separately

Use the existing Self-Healing Supervisor only for explicitly safe, reversible and idempotent recovery actions: retry, restart, isolate, fail over, reconcile or bounded rollback. No autonomous code changes are added in this phase.

**Done when:** at least two distinct real recovery classes complete with objective verification and no governance bypass.

### 6. Pilot one commercial specialist: Marketing + Sales

Marketing + Sales is the first external specialist because its existing provider adapters and approval controls already form a useful tool boundary. The specialist can research, draft, analyze and prepare campaigns. Publishing and spend remain behind the existing approval, cap, confirmation and audit controls.

**Done when:** it passes portable-specific held-out evaluations and completes customer-zero workflows without unsupported claims, unapproved publishing or spend.

### 7. Add specialists one portable at a time

Add Press & Media, Video Maker, Integrations, Campaign Studio, Control Center and Browser Agent specialists only after the shared contract and customer-zero evidence hold. Each receives its own tools, memory view, risk policy and evaluation set. No specialist may gain authority merely by naming another portable.

**Done when:** each specialist has a bounded contract, adversarial authorization tests, domain evaluation evidence and an explicit customer-facing capability statement.

### 8. Package the buyer choices

Offer each portable in three clear modes:

1. portable core and host adapters only;
2. portable plus SignalBoost specialist; or
3. portable plus COS orchestration and one or more specialists.

All modes retain buyer-controlled identity, providers, credentials, tenant boundaries, approval policy and audit. A buyer-supplied model or agent is an injected worker, never a governance bypass.

**Done when:** installation, configuration, entitlement, upgrade/rollback, support and clean-environment acceptance evidence exist for the selected package.

## Explicit non-goals

- One independent COS brain per portable.
- Free-running agents with unrestricted credentials or cross-portable authority.
- Autonomous merging, secret changes, production schema changes or unreviewed production code deployment.
- Adopting LangChain, CrewAI, AutoGen or another framework as the governance authority.
- Calling a capability commercially ready before the commercial-readiness evidence exists.

## Operating rule

Build and prove one narrow loop at a time. A successful test or preview is not enough: each promotion requires the relevant production, approval, audit and outcome evidence defined in `ONBOARD.md`.
