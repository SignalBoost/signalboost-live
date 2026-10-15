# Cursor Agent: public architecture reverse engineering for iTMounts Builder

Status: research specification, **not** an implemented or verified replacement.
Scope: reproduce publicly documented **behavior and interfaces**, not Cursor proprietary internals.
Date: 2026-10-15.

## Verified primary sources

- https://cursor.com/docs/agent/overview — three harness elements: instructions, tools, model; model-specific tuning; project delegation.
- https://docs.cursor.com/en/agent/tools — file search, grep, read, edits, terminal, web, MCP, auto-fix controls.
- https://prod.cursor.com/blog/dynamic-context-discovery — retrieve context on demand, tool outputs as files, history in summarization, selectively loaded skills/MCP, terminal sessions represented as files.
- https://cursor.com/en-US/blog/continually-improving-agent-harness — remove obsolete restrictive guardrails as model capability improves; online/offline evaluations and instrumentation.
- https://prod.cursor.com/docs/cloud-agent — persistent cloud tasks on isolated complete development environments; repository clone, dependencies, branch, tests, parallel agents.
- https://prod.cursor.com/docs/cloud-agent/security — VM-per-agent isolation, credential boundaries.
- https://cursor.com/docs/cloud-agent/capabilities — browser/computer use and artifacts to prove work.
- https://prod.cursor.com/help/ai-features/background-agents — status, continued operation with user's browser closed, PRs and evidence.

## Observable architecture (do not misrepresent as proprietary source access)

Agent coordinator (instructions + task + model adapter)
  -> Context discovery (list/search/grep/read + rules/skills/history)
  -> Durable task and plan state
  -> Tool dispatcher (typed tool arguments, result receipts)
  -> Isolated worker (real checkout, filesystem, process, dependency setup, terminal, optional browser)
  -> Test/build/lint verification, logs/artifacts
  -> Error-informed repair loop
  -> Durable checkpoints, recovery leases, and final evidence
  -> Branch/PR handoff when requested.

The model decides the next meaningful step; the harness enforces **safety boundaries** and
verification, not an arbitrary prescribed edit sequence. Duplicate complete writes are compared
against actual bytes: identical = no-op success; different = content conflict plus read/diff,
never an infinite refusal loop. Search/inspection are legitimate activities, not "failed mutation."

## Existing iTMounts components observed

- saas/lib/builder/tool-loop.ts: model control JSON, file tools, run, MCP reads, constrained browser_cli.
- saas/lib/builder/contracts.ts: workspace/runner/AI ports; no full terminal session stream or lifecycle tool.
- saas/lib/builder/workspace.ts and workspace-supabase.ts: file-record workspaces rather than VM filesystem.
- saas/lib/builder/vercel-sandbox-runner.ts: host command execution adapter.
- saas/lib/builder/checkpoint.ts: workspace digest + durable trace.
- saas/lib/builder/job-runner.ts: claimed long-running jobs, leases/heartbeat and slicing.

## Gap analysis (must be checked with executable evidence)

1. **Real development environment parity**: inspect worker filesystem, process state, dependency setup,
   package-manager behavior, tool installation, server lifecycle, terminal stdout/stderr, and cancellation.
   A one-command snapshot runner is not automatically a persistent development machine.
2. **Tool parity**: grep/symbol search, directory navigation, bounded read ranges, atomic patch/reapply,
   safe rename/delete, file changes, terminal sessions and interactive commands, MCP discovery, browser E2E.
3. **Context efficiency**: dynamic relevant-file retrieval, tool-output artifacts, compaction that preserves
   path/error references, rules and skills selected only for relevant tasks.
4. **Autonomous control**: no "must mutate next" dead-end; model-driven inspect/edit/test/repair with
   deterministic verification obligations and safe repetition handling.
5. **Durable operation**: resumable phase/tool receipts, stale lease fencing and requeue, idempotent edits,
   cancellation of timed-out processes, no concurrent writes to the same workspace.
6. **Proof and deliverables**: actual test reports, build and browser results where relevant, source revision,
   reproducible commands, artifact references; no success on unexecuted or failed tests.
7. **Evaluations**: scripted simulated-model traces + real model/provider runs, cost/latency/retry metrics,
   multiple project archetypes and interrupted-session recovery.

## Definition of done: Cursor-class Builder for iTMounts

- The OrderFlow acceptance prompt generates product catalog, cart, discounts, orders, persistent
  storage and executable tests, then runs them; all required test commands pass.
- A seeded regression deliberately triggers duplicate write_file('src/storage.js').
  The agent observes the existing content and proceeds to read/diff/verification without a loop.
- A failing test leads to a narrow source repair and a passing rerun; no hardcoded success.
- Kill an active worker between edit and test; cron reclaims the lease exactly once, verifies
  the durable workspace, resumes, and completes without replaying a destructive edit.
- Browser-driven acceptance proves an authenticated customer can submit a task, leave the page,
  return, observe progress and evidence, and access generated files.
- All tests run in isolated execution with bounded resource use, scoped credentials, network
  restrictions, auditable commands, and no user-platform credentials requested.
- For each acceptance, record exact SHA, task ID, trace, commands, exit codes, worker logs,
  duration, model/tool cost, and resulting artifact integrity.
- Canary new engine under a separate implementation and feature flag. Keep current engine
  until acceptance and rollback tests pass. No claim of parity solely on static tests.

## Non-goals

- Decompiling or claiming possession of Cursor's private implementation.
- Automatically merging unverified code.
- Treating a prompt rewrite, a new name, or a single anti-loop fix as Cursor parity.

## Immediate engineering sequence after research

1. Implement worker/session abstraction behind existing Builder contracts, with isolated
   persistent checkout, tool receipts, actual cancellation and safe workspace snapshots.
2. Implement tool dispatcher and model-adaptive control loop; separate exploration from
   mutation and verification obligations. Instrument every transition.
3. End-to-end acceptance runner with OrderFlow and failure/recovery scenarios, then canary
   comparison of old/new engines under the same tasks.
