# Builder REA — public coding-agent implementations (2026-10-16)

Scope: behavior and reusable engineering patterns, **not** wholesale imports, vendor credentials, or proprietary agent source.

| Agent | Upstream | License reported upstream | Relevant mechanism | iTMounts adaptation |
| --- | --- | --- | --- | --- |
| Aider | https://github.com/Aider-AI/aider | Apache-2.0 | Repository map; localized code edits; lint/test feedback | Keep code edits grounded in command results and affected files rather than repeatedly inspecting the entire project |
| SWE-agent | https://github.com/SWE-agent/SWE-agent | MIT | Agent-computer interface with constrained edit/search/execute commands | Existing tool receipts must be concise, actionable, and bounded; avoid repeated reads without a source change |
| Cline | https://github.com/cline/cline | Inspect license and dependency terms before copying code | Per-tool checkpoints and explicit restore options | Keep workspaces and task checkpoints independently durable; never replay completed writes after a timeout |
| Codex CLI | https://github.com/openai/codex | Apache-2.0 | Sandbox execution and explicit approvals; terminal-first verification | Execute mandatory tests in the host sandbox and require recorded exit codes after final edits |

## Applied to the OrderFlow production failure

Production Builder job e98aa467-3d1f-438f-ac59-0d345dd191e1 wrote all 15 files but continued execution slices after repeated command failures and verification-pending checkpoints. Its model round timeouts and failed inspections consumed additional rounds without demonstrating passing acceptance tests.

This branch applies the central **progress must be observable** principle: `verificationPending` is not itself progress, and unresolved failing suites must pass `builderMayContinue` before starting more work. A genuine new file write or improved test count may extend execution within the existing ceiling; waiting for a model remains independently bounded.

## Acceptance, before production merge

1. Unit tests and the Builder work-budget state-exploration regression pass.
2. Onboarding and main-write serialization checks pass.
3. A fresh sandbox OrderFlow job completes its required verification commands with persisted exit codes.
4. No unverified `verificationPending` state is presented as success.
5. A restored checkpoint does not delete completed files or repeat previous writes without cause.

**Limitations:** This document is a targeted source/behavior comparison, not evidence that upstream agents were installed, benchmarked, or copied into iTMounts. Upstream source and license must be checked at the exact pinned commit before importing code.
