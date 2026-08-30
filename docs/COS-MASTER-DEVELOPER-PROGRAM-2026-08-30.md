# COS Master Developer Program

**Status:** Phase 1 active; not Production-accepted  
**Date:** 2026-08-30

## Goal

Build a safe developer agent that earns authority through evidence, not claims.

## Required behavior

```text
understand objective
→ inspect the staged project
→ reproduce with a real command
→ make the smallest repair
→ rerun the same command
→ report files and evidence
```

## Phases

1. **Complex repair control** — stable model-control parsing, adequate bounded work/run budget, project discovery, regression gate.
2. **Multi-file diagnosis** — dependency graph, focused file selection, test/compile/lint proof selection.
3. **Repository repair certification** — staged repository snapshot, failing proof → patch → passing proof → review-ready diff.
4. **Verified experience** — retain only failure class, repair summary, proof command, environment, and outcome; never raw chat or secrets.
5. **Authority expansion** — only after held-out and real Production success rates justify each wider task class.

## Non-negotiable limits

- Isolated, ephemeral, network-denied workspace.
- No production secrets, host files, deployments, merges, or self-approval.
- No repair claim without matching successful proof.
- A regression must fail before the repair and pass after it.
- Failure patterns inform a bounded next attempt; they do not become unverified “training.”

## Phase 1 acceptance

A real authenticated Concierge repair must inspect a staged multi-file project, reproduce a failure, repair it, rerun the same test successfully, and return the changed files plus exact evidence.
