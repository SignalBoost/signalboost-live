# COS Unified Runtime — original architecture roadmap (2026-10-21)

**Status: proposed direction, not implemented acceptance proof.**

## Decision
Learn from public engineering patterns in OpenAI/ChatGPT, Cursor, Lovable, Slack and others, but build an original iTMounts implementation. Do not copy private prompts, proprietary implementations or brands. Do not create a second general-purpose orchestrator alongside the existing Platform Harness.

## Existing integration points (inspected on main)
- COS governed ingress: `saas/platform-harness/adapters/cos-ingress.ts`
- COS specialist handoff: `saas/lib/ai/cos/softwareSpecialistHarness.ts` and `saas/lib/ai/cos/a2aSpecialistHarness.ts`
- Builder: `saas/lib/builder/agent-v2.ts`, `saas/lib/builder/job-runner.ts`, persisted checkpoints
- Isolated publication/preview: `saas/lib/builder/isolated-publication.ts`

## Patterns to synthesize
- OpenAI public agent practices: explicit delegated tasks, limited authority, verifiable evidence and approvals → retain the existing COS governed handoff.
- Cursor: repository-aware coding, focused repair context, persistent tasks and test receipts → strengthen Builder's existing working set and verification loop.
- Lovable: natural-language project creation, visual iteration and portable source → attach durable preview/artifacts to the same Builder workspace.
- Slack: persistent conversation history, collaborative workflows and notifications → attach job status and approvals to a durable COS conversation, respecting tenant/member permissions.

## One canonical lifecycle
`request → classify → authorize → plan → delegate/execute → verify → publish → reconcile → report`.

The top-level COS request owns tenant, user, workspace, assistance mode, idempotency key and the acceptance contract. A child specialist inherits scoped permissions, time and budget. Tool mutations need auditable host receipts and approvals when required; retries may not silently create duplicate external effects. The Builder job remains the durable source of truth for checkpoint and completion.

## Ordered implementation slices
1. **P0: Host-computed acceptance ledger.** Structured criteria with host evidence: source hash, initial failing test, last successful source change, each separately requested command with exit code, private repository identity, PR URL, deployed verified SHA/file set, READY preview, exact HTTP status and parsed JSON, USD ledger and wall clock. Model prose cannot mark PASS.
2. **P1: Durable control.** Resume, bounded attempts, stop/cancel action, heartbeat, budgets and deadlines shared across continuations. Test that cancellation stops further writes and that restart does not reset cost.
3. **P2: Unified experience.** Left-side persistent project/task history; full-width coding, image and preview work area without a nested main card; guide/collaborate/autonomous permission modes.
4. **P3: Collaboration.** Explicitly authorized per-member connected workflows, scoped handoffs, approvals, audit history and notification delivery.
5. **P4: Evaluation.** Versioned representative workflows, simulated failure injection *separate from* real production HTTP acceptance, cost/latency/repair/rollback benchmarks.

## Release gate: Calculator API
From COS chat, create a **new private repository** when specified; initially reproduce a real arithmetic defect; repair it; run >=10 meaningful tests plus **both** `npm test` and `node --test test/*.test.js` after the last code change; commit exactly the verified artifact; open an isolated PR; deploy the same artifact to Vercel preview; observe READY; request `GET /sum?a=2&b=3` and record HTTP 200 plus `{"total":5}`; finish in one attempt within 10 minutes and $0.50; show every result in History. Missing proof means FAIL/INCOMPLETE, not PASS.

## Integration guardrails
Reuse COS ingress, Platform Harness governance, Builder checkpoint/job runner, and existing publication adapters. No unexplained competing background engine, no permission inference from generated text, no repository fallback when a new private repository is explicitly required, no homepage-only deployment smoke checks, and no synthetic results labeled as live. Each slice requires regression tests, CI and real production acceptance before being called complete.
