# COS Platform Engineer — Foundation

**Status:** implementation active; not Production-accepted  
**Date:** 2026-08-30

## Purpose

COS Builder proves work in a user workspace. The Platform Engineer is the separate agent responsible for diagnosing and preparing safe repairs to the SignalBoost codebase.

It is not a self-modifying production system.

## Required loop

```text
inspect repository
→ discover runtime / package manager / test commands
→ reproduce the reported failure
→ read concise diagnostics and relevant files
→ make a minimal change
→ rerun the same proof command
→ return diff, command evidence, and an approval-ready repair
```

A repair is not complete merely because the model says it is fixed.

## Authority boundary

- Runs only in an isolated, ephemeral, network-denied sandbox.
- Starts from an explicit repository snapshot and records its revision.
- Can read, edit, and run only the staged workspace.
- Never reads production secrets, host files, provider credentials, or deployment configuration.
- Cannot merge, deploy, change production data, or approve its own work.
- A human/owner or existing governed approval path decides whether a verified repair is merged.

## Foundation deliverables

1. Project context discovery: manifest, package manager, scripts, test files, and recommended proof command.
2. Deterministic repair state: inspect → reproduce → repair → verify.
3. Compact tool evidence: commands, exit code, bounded stdout/stderr, changed files, and runtime facts.
4. Regression evidence gate: failing proof before repair, passing proof after repair.
5. Evaluation ladder: single file, multi-file, dependency/runtime, then a controlled repository repair.

## Acceptance

Production acceptance requires a fresh authenticated run that:

- discovers a real project test command,
- reproduces a failure,
- edits the supplied code,
- reruns the same command successfully,
- returns the changed files and exact evidence.

No raw chat history is used as training data. Only verified cause, repair, proof command, environment, and outcome can become a bounded lesson.
